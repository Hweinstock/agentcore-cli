import { FsTreeNode } from "./fsTree";
import type { AssetSource } from "../source";
import type { Evaluator } from "../../../projectSchemas/evaluator";
import type { TemplateRenderer, TemplateResolver } from "./types";

/** Inputs for scaffolding a managed code-based evaluator's Lambda source. */
export type EvaluatorScaffoldInput = {
  evaluator: Evaluator;
  /** Template directory under src/assets/evaluators, e.g. "evaluators/deepeval-lambda". */
  assetDir: string;
  /** Handlebars variables for the template (EvaluatorClass, Model, ModelProviderBedrock, ...). */
  context: Record<string, unknown>;
};

type GetEvaluatorTemplateResolverConfig = {
  assetSource: AssetSource;
  templateRenderer: TemplateRenderer;
};

/** Resolves the template that renders a managed code-based evaluator's code directory. */
export function getEvaluatorTemplateResolver(
  config: GetEvaluatorTemplateResolverConfig,
): TemplateResolver<EvaluatorScaffoldInput> {
  return {
    async resolve(input) {
      const tree = await FsTreeNode.fromAssetSource(
        { assetSource: config.assetSource },
        { assetDir: input.assetDir },
        {
          rootDirName: input.evaluator.name,
          transformContent: (raw) => config.templateRenderer.render(raw, input.context),
        },
      );
      return { tree, spec: { evaluators: [input.evaluator] } };
    },
  };
}
