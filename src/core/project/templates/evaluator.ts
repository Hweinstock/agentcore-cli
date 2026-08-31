import { FsTreeNode } from "./fsTree";
import type { AssetSource } from "../source";
import type { Evaluator } from "../../../projectSchemas/evaluator";
import type { TemplateRenderer, TemplateResolver } from "./types";

export type EvaluatorScaffoldInput = {
  evaluator: Evaluator;
  assetDir: string;
  context: Record<string, unknown>;
};

type GetEvaluatorTemplateResolverConfig = {
  assetSource: AssetSource;
  templateRenderer: TemplateRenderer;
};

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
