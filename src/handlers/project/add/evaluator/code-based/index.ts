import z from "zod";
import { createHandler, flag, ProjectKey } from "../../../../../router";
import { InputValidationError } from "../../../../../errors";
import { EvaluatorSchema, isValidBedrockModelId } from "../../../../../projectSchemas/evaluator";
import { TagsSchema } from "../../../../../projectSchemas/tags";
import { toPythonPackageName } from "../../../../../core/project/fsUtils";
import { parseJsonFlagWithSchema } from "../../../../utils";
import type { AddProjectResourceConfig } from "../../types";

const DEFAULT_TIMEOUT = 60;

const LIBRARIES: Record<string, { assetDir: string; defaultTimeoutSeconds: number }> = {
  deepeval: { assetDir: "evaluators/deepeval-lambda", defaultTimeoutSeconds: 300 },
  autoevals: { assetDir: "evaluators/autoevals-lambda", defaultTimeoutSeconds: DEFAULT_TIMEOUT },
};

const EMPTY_ASSET_DIR = "evaluators/python-lambda";

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
        if (flags["model"] && !hasMetric)
          throw new InputValidationError("--model requires --metric");

        let assetDir = EMPTY_ASSET_DIR;
        let defaultTimeout = DEFAULT_TIMEOUT;
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
      if (!hasLambda) {
        if (!hasMetric)
          config.io.stderr.write(
            `note: this evaluator returns Pass for every session until you implement app/${flags["name"]}/lambda_function.py\n`,
          );
        config.io.stderr.write(
          `note: managed code-based evaluators are scaffolded locally but not yet provisioned by 'project deploy' (pending CDK/L3 support)\n`,
        );
      }
    },
  });

function resolveBedrockModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const id = model.startsWith("bedrock/") ? model.slice("bedrock/".length) : model;
  if (!isValidBedrockModelId(id))
    throw new InputValidationError(
      `invalid --model "${model}": expected a Bedrock model ID (e.g. anthropic.claude-3-5-sonnet-20240620-v1:0) or an inference-profile/foundation-model ARN, optionally prefixed with "bedrock/"`,
    );
  return id;
}
