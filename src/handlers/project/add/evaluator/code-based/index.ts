import z from "zod";
import { createHandler, flag, ProjectKey } from "../../../../../router";
import { InputValidationError } from "../../../../../errors";
import { EvaluatorSchema, isValidBedrockModelId } from "../../../../../projectSchemas/evaluator";
import { TagsSchema } from "../../../../../projectSchemas/tags";
import { parseJsonFlagWithSchema } from "../../../../utils";
import type { AddProjectResourceConfig } from "../../types";

// 3P evaluator libraries the CLI can scaffold. The metric class is passed
// through to the library (not allowlisted here) — only the library prefix is
// validated. Default timeouts mirror the old CLI's THIRD_PARTY_EVALUATOR_LIBRARIES.
const LIBRARIES: Record<string, { assetDir: string; defaultTimeoutSeconds: number }> = {
  deepeval: { assetDir: "evaluators/deepeval-lambda", defaultTimeoutSeconds: 300 },
  autoevals: { assetDir: "evaluators/autoevals-lambda", defaultTimeoutSeconds: 60 },
};

const EMPTY_ASSET_DIR = "evaluators/python-lambda";
const EMPTY_DEFAULT_TIMEOUT_SECONDS = 60;

export const createAddCodeBasedEvaluatorHandler = (config: AddProjectResourceConfig) =>
  createHandler({
    name: "code-based",
    description:
      "add a code-based evaluator — a Lambda that scores a session. Pass a 3P metric, an existing Lambda, or neither to scaffold an empty evaluator you fill in",
    flags: [
      flag("name", "the name of the evaluator", z.string().optional()),
      flag("level", "what to score: SESSION, TRACE, or TOOL_CALL", z.string().optional()),
      flag(
        "metric",
        "3P metric to scaffold as <library.Metric>, e.g. deepeval.FaithfulnessMetric or autoevals.Factuality",
        z.string().optional(),
      ),
      flag(
        "model",
        "judge model for the 3P metric, e.g. bedrock/anthropic.claude-3-5-sonnet-20240620-v1:0",
        z.string().optional(),
      ),
      flag("lambda-arn", "ARN of an existing Lambda that scores a session", z.string().optional()),
      flag(
        "timeout-seconds",
        "Lambda timeout in seconds (1-300)",
        z.number().int().min(1).max(300).optional(),
      ),
      flag("description", "a description of what this evaluator measures", z.string().optional()),
      flag(
        "kms-key-arn",
        "customer-managed KMS key ARN to encrypt the evaluator",
        z.string().optional(),
      ),
      flag("tags", "tags to apply (JSON object of key/value strings)", z.string().optional()),
    ],
    handle: async (ctx, flags) => {
      if (!flags["name"])
        throw new InputValidationError("required option '--name <name>' not specified");
      if (!flags["level"])
        throw new InputValidationError("required option '--level <level>' not specified");

      const hasMetric = flags["metric"] !== undefined;
      const hasLambda = flags["lambda-arn"] !== undefined;
      if (hasMetric && hasLambda)
        throw new InputValidationError(
          "provide either --metric (managed) or --lambda-arn (external), not both",
        );

      const tags = parseJsonFlagWithSchema("tags", flags["tags"], TagsSchema);
      const base = {
        name: flags["name"],
        level: flags["level"],
        description: flags["description"],
        kmsKeyArn: flags["kms-key-arn"],
        tags,
      };

      // Kept loose so `--level` stays a plain string for EvaluatorSchema to
      // validate (mirrors the llm-as-a-judge handler); safeParse narrows it.
      let candidate: Record<string, unknown>;
      let scaffold: { assetDir: string; context: Record<string, unknown> } | undefined;

      if (hasLambda) {
        if (flags["metric"] || flags["model"] || flags["timeout-seconds"] !== undefined)
          throw new InputValidationError(
            "--metric, --model, and --timeout-seconds are managed-only and not valid with --lambda-arn",
          );
        candidate = {
          ...base,
          config: { codeBased: { external: { lambdaArn: flags["lambda-arn"] } } },
        };
      } else {
        // managed: 3P metric, or empty stub when no metric is given.
        if (flags["model"] && !hasMetric)
          throw new InputValidationError("--model requires --metric");

        let assetDir = EMPTY_ASSET_DIR;
        let defaultTimeout = EMPTY_DEFAULT_TIMEOUT_SECONDS;
        const context: Record<string, unknown> = { Name: toPythonPackageName(flags["name"]) };

        if (hasMetric) {
          const raw = flags["metric"]!;
          const dot = raw.indexOf(".");
          const library = dot > 0 ? raw.slice(0, dot) : "";
          const metricClass = dot > 0 ? raw.slice(dot + 1) : "";
          const lib = library && metricClass ? LIBRARIES[library] : undefined;
          if (!lib)
            throw new InputValidationError(
              `invalid --metric "${raw}": expected <library.Metric> where library is one of ${Object.keys(LIBRARIES).join(", ")} (e.g. deepeval.FaithfulnessMetric)`,
            );
          // The class is rendered straight into `from <lib> import <class>` and
          // `<class>(...)`, so it must be a single Python identifier. Reject
          // dotted/namespaced values (e.g. deepeval.metrics.Faithfulness) that
          // would emit invalid Python and only fail at deploy/runtime.
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(metricClass))
            throw new InputValidationError(
              `invalid metric class "${metricClass}" in --metric "${raw}": expected a single class name like FaithfulnessMetric`,
            );
          assetDir = lib.assetDir;
          defaultTimeout = lib.defaultTimeoutSeconds;

          const model = resolveBedrockModel(flags["model"]);
          context["EvaluatorClass"] = metricClass;
          context["Model"] = model ?? "";
          context["ModelProviderBedrock"] = model !== undefined;
          context["EvaluatorParams"] = "";
        }

        const timeoutSeconds = flags["timeout-seconds"] ?? defaultTimeout;
        candidate = {
          ...base,
          config: {
            codeBased: {
              managed: {
                codeLocation: `app/${flags["name"]}`,
                entrypoint: "lambda_function.handler",
                timeoutSeconds,
                additionalPolicies: ["execution-role-policy.json"],
              },
            },
          },
        };
        scaffold = { assetDir, context };
      }

      const parsed = EvaluatorSchema.safeParse(candidate);
      if (!parsed.success) throw new InputValidationError(z.prettifyError(parsed.error));

      const project = ctx.require(ProjectKey);
      for await (const event of config.projectManager.addResource(project, {
        resourceType: "evaluator",
        resourceConfig: parsed.data,
        scaffold,
      })) {
        config.io.stderr.write(`${event.message}\n`);
      }

      config.io.stderr.write(`added evaluator '${flags["name"]}' to '${project.name}'\n`);
    },
  });

// Judge model for a 3P metric. Bedrock-only: accepts a bare Bedrock model id /
// inference-profile-or-foundation-model ARN, optionally prefixed with
// `bedrock/`, and returns the id with the prefix stripped. Anything else errors
// rather than silently degrading — a non-Bedrock value is dropped by the
// deepeval template and passed to the wrong client by autoevals. Returns
// undefined when no --model was given (library default).
function resolveBedrockModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const id = model.startsWith("bedrock/") ? model.slice("bedrock/".length) : model;
  if (!isValidBedrockModelId(id))
    throw new InputValidationError(
      `invalid --model "${model}": expected a Bedrock model ID (e.g. anthropic.claude-3-5-sonnet-20240620-v1:0) or an inference-profile/foundation-model ARN, optionally prefixed with "bedrock/"`,
    );
  return id;
}

// PEP 508 package name: ASCII letters/numbers/period/underscore/hyphen, must
// start and end alphanumeric. Mirrors the runtime template helper.
function toPythonPackageName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/[^a-zA-Z0-9]+$/, "");
}
