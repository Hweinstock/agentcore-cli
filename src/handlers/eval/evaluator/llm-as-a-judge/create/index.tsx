import z from "zod";
import { createHandler, flag } from "../../../../../router";
import { InputValidationError } from "../../../../../errors";
import { JsonRendererKey } from "../../../../../tui";
import { SourceResolver, type AppIO } from "../../../../../io";
import type { Core } from "../../../../types";
import { coreOptsFromCtx, parseJsonFlag } from "../../../../utils";
import { instructionsFlag, ratingScaleFlag, resolveRatingScale } from "../sharedFlags";
import { LEVELS } from "../../levels";

const requiredInstructionsFlag = flag(
  instructionsFlag.name,
  instructionsFlag.description,
  z.string().min(1),
);
const requiredRatingScaleFlag = flag(
  ratingScaleFlag.name,
  ratingScaleFlag.description,
  z.string().min(1),
);

export const createLlmAsAJudgeCreateHandler = (core: Core, io: AppIO) =>
  createHandler({
    name: "create",
    description: "create an LLM-as-a-Judge evaluator",
    flags: [
      flag("name", "the name of the evaluator", z.string().min(1)),
      flag("level", `evaluation level (${LEVELS.join(" | ")})`, z.enum(LEVELS)),
      flag("model", "the Bedrock model ID used to judge", z.string().min(1)),
      requiredInstructionsFlag,
      requiredRatingScaleFlag,
      flag("kms-key-arn", "customer managed KMS key ARN for evaluator data", z.string().optional()),
      flag(
        "tags",
        "tags to apply (JSON object of key/value strings; inline, file://<path>, or - for stdin)",
        z.string().optional(),
      ),
    ],
    handle: async (ctx, flags) => {
      const source = new SourceResolver({ stdin: io.stdin });
      const instructions = await source.resolveText("instructions", flags["instructions"]);
      if (instructions === "") {
        throw new InputValidationError("Option '--instructions' must resolve to nonempty text");
      }
      const ratingScale = await resolveRatingScale(flags["rating-scale"], source);
      if (!ratingScale) {
        throw new InputValidationError(
          "Option '--rating-scale' must resolve to a nonempty JSON value",
        );
      }
      const tags = parseJsonFlag<Record<string, string>>(
        "tags",
        await source.resolveText("tags", flags["tags"]),
      );

      const response = await core.eval.createEvaluator(
        {
          evaluatorName: flags["name"],
          level: flags["level"],
          evaluatorConfig: {
            llmAsAJudge: {
              instructions,
              ratingScale,
              modelConfig: { bedrockEvaluatorModelConfig: { modelId: flags["model"] } },
            },
          },
          kmsKeyArn: flags["kms-key-arn"],
          tags,
        },
        coreOptsFromCtx(ctx),
      );
      ctx.require(JsonRendererKey).renderJson(response);
    },
  });
