import { createHash } from "node:crypto";
import { stat, readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { AgentCoreCLIError, ERROR_SOURCE, InputValidationError } from "../errors";
import { PACKAGE_VERSION } from "../constants";
import type { CoreFetch, CoreOptions } from "./types";
import type {
  CoreFeedbackClient,
  FeedbackSubmissionResult,
  SubmitFeedbackInput,
} from "../handlers/feedback/types";

// Aperture public feedback API. These are commercial-partition (.aws.dev) endpoints
// with no partition variant, so feedback is unavailable in GovCloud/China — carried
// over from the pre-refactor CLI, flagged here rather than silently.
const INGESTION_URL = "https://ingestion.aperture-public-api.feedback.console.aws.dev/form";
const PRESIGN_URL =
  "https://presignedurl.aperture-public-api.feedback.console.aws.dev/presignedurl";
const FORM_CATEGORY = "AgentCore";
const FORM_NAME = "CLI";
const FORM_VERSION = "0.1.0";
const LOCALE = "en_US";
const REFERENCE = "agentcore-cli";
const MESSAGE_QUESTION = "What feedback do you have for the AgentCore CLI";
const ATTACHMENT_QUESTION = "Attachments";
const MESSAGE_MAX_LENGTH = 1000;
const MAX_SCREENSHOT_BYTES = 100 * 1024 * 1024;
const ALLOWED_SCREENSHOT_EXTENSIONS = [".png", ".jpg", ".jpeg"] as const;

// Rendered by the feedback command's consent prompt before every submission.
export const CONSENT_TEXT =
  "All feedback submissions, including any uploaded text and images, are subject " +
  "to the AWS Customer Agreement (https://aws.amazon.com/agreement/). By submitting " +
  'feedback, you agree that your submissions constitute "Suggestions" as defined ' +
  "in the AWS Customer Agreement.";

// Extends the CLI error hierarchy (the pre-refactor ApertureError extended plain
// Error, so telemetry classified it as unknown) so failures record error_source=service.
export class ApertureError extends AgentCoreCLIError {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message, { source: ERROR_SOURCE.SERVICE, name: "ApertureError" });
  }
}

interface LoadedScreenshot {
  buffer: Uint8Array;
  fileName: string;
  contentType: string;
  sha256Base64: string;
  size: number;
}

interface ApertureCustomerResponse {
  question: string;
  pii: boolean;
  response:
    | { responseType: "textArea"; responseValue: string }
    | { responseType: "fileUpload"; responseValue: string[] };
}

interface ApertureFormPayload {
  category: string;
  name: string;
  version: string;
  locale: string;
  reference: string;
  location: string;
  customerResponses: ApertureCustomerResponse[];
  metadataList: { key: string; value: string }[];
}

export class FeedbackClient implements CoreFeedbackClient {
  // Feedback posts to the Aperture public API via the injected fetch only; it makes
  // no AWS SDK calls, so it does not take the AwsClients aggregate its siblings do.
  constructor(private readonly fetch: CoreFetch) {}

  async submitFeedback(
    input: SubmitFeedbackInput,
    _options: CoreOptions,
  ): Promise<FeedbackSubmissionResult> {
    const message = input.message.trim();
    if (!message) {
      throw new InputValidationError("Feedback message cannot be empty.");
    }
    if (message.length > MESSAGE_MAX_LENGTH) {
      throw new InputValidationError(
        `Feedback message must be ${MESSAGE_MAX_LENGTH} characters or fewer.`,
      );
    }

    const userAgent = `AgentCoreCLI/${PACKAGE_VERSION} (${process.platform} ${os.release()}; node/${process.version})`;

    let screenshotReference: string | undefined;
    if (input.screenshot) {
      const file = await this.loadScreenshot(input.screenshot.path);
      const presignedUrl = await this.fetchPresignedUrl(
        {
          category: FORM_CATEGORY,
          name: FORM_NAME,
          version: FORM_VERSION,
          fileName: file.fileName,
          fileSize: file.size,
          uploadFileSHA256: file.sha256Base64,
        },
        userAgent,
      );
      await this.uploadFileToS3(
        presignedUrl,
        file.buffer,
        file.contentType,
        file.sha256Base64,
        userAgent,
      );
      screenshotReference = objectKeyFromPresignedUrl(presignedUrl);
    }

    const payload = buildFeedbackPayload({ message, screenshotReference });
    const response = await this.submitForm(payload, userAgent);
    return {
      id: response.id,
      timestamp: response.timestamp,
      reference: response.reference,
    };
  }

  // Aperture returns the presigned URL as a plain-text body (not JSON).
  private async fetchPresignedUrl(
    request: {
      category: string;
      name: string;
      version: string;
      fileName: string;
      fileSize: number;
      uploadFileSHA256: string;
    },
    userAgent: string,
  ): Promise<string> {
    const response = await this.fetch(PRESIGN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": userAgent },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new ApertureError(
        `Failed to fetch screenshot upload URL (HTTP ${response.status}).`,
        response.status,
        await readBody(response),
      );
    }
    return (await response.text()).trim();
  }

  // Aperture's bucket policy requires the SHA-256 checksum headers and a tag
  // marking the object as not yet AV-scanned; omitting either is rejected.
  private async uploadFileToS3(
    presignedUrl: string,
    fileBuffer: Uint8Array,
    contentType: string,
    base64Sha256: string,
    userAgent: string,
  ): Promise<void> {
    const response = await this.fetch(presignedUrl, {
      method: "PUT",
      headers: {
        "content-type": contentType,
        "x-amz-checksum-algorithm": "SHA256",
        "x-amz-checksum-sha256": base64Sha256,
        "x-amz-tagging": "scanstatus=NOT_SCANNED",
        "user-agent": userAgent,
      },
      body: fileBuffer,
    });
    if (!response.ok) {
      throw new ApertureError(
        `Failed to upload screenshot (HTTP ${response.status}).`,
        response.status,
        await readBody(response),
      );
    }
  }

  private async submitForm(
    payload: ApertureFormPayload,
    userAgent: string,
  ): Promise<FeedbackSubmissionResult> {
    const response = await this.fetch(INGESTION_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": userAgent },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await readBody(response);
      throw new ApertureError(mapStatusToMessage(response.status, body), response.status, body);
    }
    return (await response.json()) as FeedbackSubmissionResult;
  }

  private async loadScreenshot(rawFilePath: string): Promise<LoadedScreenshot> {
    const filePath = expandTilde(rawFilePath);

    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(filePath);
    } catch (err) {
      throw new InputValidationError(
        `Could not read screenshot at ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (stats.isDirectory()) {
      throw new InputValidationError(`Screenshot path is a directory, not a file: ${filePath}`);
    }
    if (!stats.isFile()) {
      throw new InputValidationError(`Screenshot path is not a regular file: ${filePath}`);
    }
    // Reject oversized files from stat before readFile, so a hostile/huge file
    // is never loaded into memory just to be rejected.
    if (stats.size > MAX_SCREENSHOT_BYTES) {
      const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
      throw new InputValidationError(`Screenshot is ${sizeMb} MB; maximum allowed size is 100 MB.`);
    }

    const ext = path.extname(filePath).toLowerCase();
    if (
      !ALLOWED_SCREENSHOT_EXTENSIONS.includes(ext as (typeof ALLOWED_SCREENSHOT_EXTENSIONS)[number])
    ) {
      throw new InputValidationError(
        `Screenshot must be one of: ${ALLOWED_SCREENSHOT_EXTENSIONS.join(", ")}.`,
      );
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch (err) {
      throw new InputValidationError(
        `Could not read screenshot at ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return {
      buffer: new Uint8Array(buffer),
      fileName: path.basename(filePath),
      contentType: ext === ".png" ? "image/png" : "image/jpeg",
      sha256Base64: createHash("sha256").update(buffer).digest("base64"),
      size: buffer.byteLength,
    };
  }
}

// Expand a leading ~ / ~/... to $HOME. Node's fs APIs don't expand tildes (the
// shell normally does), so a quoted path like "~/shot.png" would otherwise ENOENT.
function expandTilde(filePath: string): string {
  if (filePath === "~") return os.homedir();
  if (filePath.startsWith("~/")) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

// The presigned URL's path IS the S3 object key the form must reference;
// fabricating one client-side risks pointing at a nonexistent object if
// Aperture's bucket layout or region shifts.
function objectKeyFromPresignedUrl(presignedUrl: string): string {
  try {
    return decodeURIComponent(new URL(presignedUrl).pathname.replace(/^\/+/, ""));
  } catch {
    // A 2xx presign body that isn't a URL is a service fault, not a bare TypeError —
    // classify it so telemetry attributes it to the service, not internal.
    throw new ApertureError("Feedback service returned an invalid screenshot upload URL.");
  }
}

function buildFeedbackPayload(input: {
  message: string;
  screenshotReference?: string;
}): ApertureFormPayload {
  const customerResponses: ApertureCustomerResponse[] = [
    {
      question: MESSAGE_QUESTION,
      pii: false,
      response: { responseType: "textArea", responseValue: input.message },
    },
  ];
  if (input.screenshotReference) {
    customerResponses.push({
      question: ATTACHMENT_QUESTION,
      pii: true,
      response: { responseType: "fileUpload", responseValue: [input.screenshotReference] },
    });
  }

  // Aperture rejects unknown metadata keys with HTTP 400; only cli-version and os
  // are registered in the form template, so node version + mode ride in `location`.
  return {
    category: FORM_CATEGORY,
    name: FORM_NAME,
    version: FORM_VERSION,
    locale: LOCALE,
    reference: REFERENCE,
    location: `agentcore-cli@${PACKAGE_VERSION} (${process.platform}; node ${process.version}; cli)`,
    customerResponses,
    metadataList: [
      { key: "cli-version", value: PACKAGE_VERSION },
      { key: "os", value: `${process.platform} ${os.release()}` },
    ],
  };
}

function mapStatusToMessage(status: number, body: string): string {
  switch (status) {
    case 400:
      return `Feedback service rejected the submission (HTTP 400). ${body || "Form payload may be malformed."}`;
    case 412:
      return "Feedback service is missing required headers (HTTP 412).";
    case 417:
      return "Feedback service rejected the request content type (HTTP 417).";
    case 500:
      return "Feedback service returned an internal error (HTTP 500). Please try again later.";
    default:
      return `Feedback service returned HTTP ${status}.`;
  }
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
