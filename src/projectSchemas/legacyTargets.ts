import { z } from "zod";
import { AwsDeploymentTargetSchema } from "./aws-targets";
import { uniqueBy } from "./zod-util";

/** Preserves v0 target names, including hyphens and names distinguished only by case. */
export const LegacyAwsDeploymentTargetsSchema = z
  .array(
    AwsDeploymentTargetSchema.extend({
      name: z
        .string()
        .min(1)
        .max(64)
        .regex(
          /^[a-zA-Z][a-zA-Z0-9-]*$/,
          "Name must start with a letter and contain only alphanumeric characters and hyphens",
        ),
    }),
  )
  .superRefine(
    uniqueBy(
      (target) => target.name,
      (name) => `Duplicate deployment target name: ${name}`,
    ),
  );
