import { createInterface } from "node:readline/promises";
import z from "zod";
import { argument, createHandler, flag } from "../../router";
import { JsonRendererKey } from "../../tui";
import { InputValidationError, UserCancellationError } from "../../errors";
import { coreOptsFromCtx } from "../utils.tsx";
import { JsonKey } from "../keys.tsx";
import { CONSENT_TEXT } from "../../core/feedback";
import type { Core } from "../types.tsx";
import type { AppIO } from "../../io";

export const createFeedbackHandler = (core: Core, io: AppIO) =>
  createHandler({
    name: "feedback",
    description: "Send feedback about the AgentCore CLI to the team.",
    arguments: [argument("message", "the feedback message to send", z.string().max(1000))],
    flags: [
      flag(
        "screenshot",
        "path to a PNG or JPG screenshot to attach (max 100MB)",
        z.string().optional(),
      ),
      flag(
        "yes",
        "accept the AWS Customer Agreement and skip the consent prompt",
        z.boolean().default(false),
      ),
    ],
    handle: async (ctx, flags, args) => {
      await confirmConsent(io, ctx.require(JsonKey), flags.yes);

      const result = await core.feedback.submitFeedback(
        {
          message: args["message"],
          screenshot: flags["screenshot"] ? { path: flags["screenshot"] } : undefined,
        },
        coreOptsFromCtx(ctx),
      );

      ctx.require(JsonRendererKey).renderJson({ success: true, ...result });
    },
  });

// Mirrors project/remove's confirmRemoveAll: --yes bypasses the prompt, a
// non-interactive session (or --json) fails rather than submitting without
// consent, and a decline (or SIGINT) raises UserCancellationError.
async function confirmConsent(io: AppIO, jsonOutput: boolean, confirmed: boolean): Promise<void> {
  if (confirmed) return;
  const canPrompt = !jsonOutput && io.stdin.isTTY && io.stdout.isTTY && io.stderr.isTTY;
  if (!canPrompt) {
    throw new InputValidationError(
      "submitting feedback requires accepting the AWS Customer Agreement; re-run with --yes to confirm non-interactively",
    );
  }
  if (!(await promptForConsent(io))) {
    throw new UserCancellationError();
  }
}

async function promptForConsent(io: AppIO): Promise<boolean> {
  // Prompt on stderr so --json / piped stdout stays a clean machine-readable stream.
  const readline = createInterface({ input: io.stdin, output: io.stderr });
  try {
    const cancelled = new Promise<never>((_resolve, reject) => {
      const cancel = () => reject(new UserCancellationError());
      readline.once("SIGINT", cancel);
      readline.once("close", cancel);
    });
    const answer = await Promise.race([
      readline.question(`\n${CONSENT_TEXT}\n\nSubmit feedback? (y/N) `),
      cancelled,
    ]);
    return /^(?:y|yes)$/i.test(answer.trim());
  } finally {
    readline.close();
  }
}
