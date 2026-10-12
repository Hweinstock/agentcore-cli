import { describe, expect, test } from "bun:test";
import { AwsDeploymentTargetsSchema, type AwsDeploymentTarget } from "./aws-targets";
import { LegacyAwsDeploymentTargetsSchema } from "./legacyTargets";

const target: AwsDeploymentTarget = {
  name: "default",
  account: "111122223333",
  region: "us-east-1",
};

describe("legacy deployment targets", () => {
  test.each(["dev-us-east", "dev-", "Dev--East", "a".repeat(64)])(
    "accepts the original v0 target name %j",
    (name) => {
      const targets = [{ ...target, name }];
      expect(LegacyAwsDeploymentTargetsSchema.parse(targets)).toEqual(targets);
    },
  );

  test.each(["", "1dev", "-dev", "dev_east", "dev.east", "dev east", "a".repeat(65)])(
    "rejects invalid v0 target name %j",
    (name) => {
      expect(LegacyAwsDeploymentTargetsSchema.safeParse([{ ...target, name }]).success).toBe(false);
    },
  );

  test("preserves case-distinct names and rejects exact duplicates", () => {
    const targets = [
      { ...target, name: "Dev" },
      { ...target, name: "dev" },
    ];
    expect(LegacyAwsDeploymentTargetsSchema.parse(targets)).toEqual(targets);
    const duplicated = LegacyAwsDeploymentTargetsSchema.safeParse([targets[0], targets[0]]);
    expect(duplicated.success).toBe(false);
    expect(duplicated.error?.issues[0]?.message).toBe("Duplicate deployment target name: Dev");
  });

  test.each([
    { targets: [{ ...target, name: "dev-us-east" }] },
    {
      targets: [
        { ...target, name: "Dev" },
        { ...target, name: "dev" },
      ],
    },
  ])("keeps modern target validation unchanged for $targets", ({ targets }) => {
    expect(AwsDeploymentTargetsSchema.safeParse(targets).success).toBe(false);
    expect(LegacyAwsDeploymentTargetsSchema.safeParse(targets).success).toBe(true);
  });

  test.each([{ account: "invalid" }, { region: "not-a-region" }, { description: "a".repeat(257) }])(
    "continues validating the target fields: %j",
    (overrides) => {
      expect(
        LegacyAwsDeploymentTargetsSchema.safeParse([{ ...target, ...overrides }]).success,
      ).toBe(false);
    },
  );
});
