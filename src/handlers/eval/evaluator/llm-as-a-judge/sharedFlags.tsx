import z from "zod";
import type { RatingScale } from "@aws-sdk/client-bedrock-agentcore-control";
import { flag, type Flag } from "../../../../router";
import { parseJsonObjectFlag } from "../../../utils";
import {
  RATING_SCALE_PRESET_IDS,
  isRatingScalePreset,
  ratingScaleFromPreset,
} from "../../ratingScale";
import type { SourceResolver } from "../../../../io";

function sharedStringFlag<N extends string>(
  name: N,
  description: string,
): Flag<N, string> & { optional: () => Flag<N, string | undefined> } {
  return {
    ...flag(name, description, z.string().min(1)),
    optional: () => flag(name, description, z.string().optional()),
  };
}

export const instructionsFlag = sharedStringFlag(
  "instructions",
  "evaluation instructions (inline, file://<path>, or - for stdin)",
);

export const ratingScaleFlag = sharedStringFlag(
  "rating-scale",
  `rating scale: a preset (${RATING_SCALE_PRESET_IDS.join(" | ")}) or a custom RatingScale (JSON inline, file://<path>, or - for stdin)`,
);

// resolveRatingScale turns the single --rating-scale value into a RatingScale, or
// undefined when the flag is omitted. A value matching a known preset id expands
// to that preset; anything else is a source-aware JSON RatingScale (inline,
// file://<path>, or - for stdin). A file literally named after a preset is still
// reachable via file://.
export async function resolveRatingScale(
  value: string | undefined,
  source: SourceResolver,
): Promise<RatingScale | undefined> {
  if (value === undefined) return undefined;
  if (isRatingScalePreset(value)) return ratingScaleFromPreset(value);
  const raw = await source.resolveText("rating-scale", value);
  return parseJsonObjectFlag<RatingScale>("rating-scale", raw);
}
