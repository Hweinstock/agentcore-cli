import { FsTreeNode } from "./fsTree";
import type { AssetSource } from "../source";
import type { Evaluator, EvaluationLevel } from "../../../projectSchemas/evaluator";
import type { TemplateRenderer, TemplateResolver } from "./types";
import { toPythonPackageName } from "../fsUtils";

const DEFAULT_TIMEOUT = 60;

export const EVALUATOR_LIBRARIES = {
  deepeval: { assetDir: "evaluators/deepeval-lambda", defaultTimeoutSeconds: 300 },
  autoevals: { assetDir: "evaluators/autoevals-lambda", defaultTimeoutSeconds: DEFAULT_TIMEOUT },
} as const;

export type EvaluatorLibrary = keyof typeof EVALUATOR_LIBRARIES;

const EMPTY_ASSET_DIR = "evaluators/python-lambda";

export type ManagedEvaluatorScaffoldInput = {
  name: string;
  level: EvaluationLevel;
  description?: string;
  kmsKeyArn?: string;
  tags?: Record<string, string>;
  metric?: { library: EvaluatorLibrary; metricClass: string };
  model?: string;
  timeoutSeconds?: number;
};

function buildManagedEvaluatorSpec(input: ManagedEvaluatorScaffoldInput): Evaluator {
  const timeoutSeconds =
    input.timeoutSeconds ??
    (input.metric
      ? EVALUATOR_LIBRARIES[input.metric.library].defaultTimeoutSeconds
      : DEFAULT_TIMEOUT);
  return {
    name: input.name,
    level: input.level,
    ...(input.description && { description: input.description }),
    config: {
      codeBased: {
        managed: {
          codeLocation: `app/${input.name}`,
          entrypoint: "lambda_function.handler",
          timeoutSeconds,
          additionalPolicies: ["execution-role-policy.json"],
        },
      },
    },
    ...(input.kmsKeyArn && { kmsKeyArn: input.kmsKeyArn }),
    ...(input.tags && { tags: input.tags }),
  };
}

function buildRenderContext(input: ManagedEvaluatorScaffoldInput): Record<string, unknown> {
  const context: Record<string, unknown> = { Name: toPythonPackageName(input.name) };
  if (input.metric) {
    context["EvaluatorClass"] = input.metric.metricClass;
    context["Model"] = input.model ?? "";
    context["ModelProviderBedrock"] = input.model !== undefined;
    context["EvaluatorParams"] = "";
  }
  return context;
}

type GetEvaluatorTemplateResolverConfig = {
  assetSource: AssetSource;
  templateRenderer: TemplateRenderer;
};

export function getEvaluatorTemplateResolver(
  config: GetEvaluatorTemplateResolverConfig,
): TemplateResolver<ManagedEvaluatorScaffoldInput> {
  return {
    async resolve(input) {
      const assetDir = input.metric
        ? EVALUATOR_LIBRARIES[input.metric.library].assetDir
        : EMPTY_ASSET_DIR;
      const tree = await FsTreeNode.fromAssetSource(
        { assetSource: config.assetSource },
        { assetDir },
        {
          rootDirName: input.name,
          transformContent: (raw) => config.templateRenderer.render(raw, buildRenderContext(input)),
        },
      );
      return { tree, spec: { evaluators: [buildManagedEvaluatorSpec(input)] } };
    },
  };
}
