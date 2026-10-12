import { describe, expect, test } from "bun:test";
import {
  isV0ProjectSpec,
  LegacyCompatibleProjectSpecSchema,
  normalizeProjectSpec,
} from "./legacyProject";

const runtime = {
  name: "agent",
  build: "CodeZip",
  entrypoint: "main.py",
  codeLocation: "./app/agent",
  runtimeVersion: "PYTHON_3_12",
};
const toolRuntime = {
  name: "search",
  toolDefinition: {
    name: "search",
    description: "Search the catalog",
    inputSchema: { type: "object" },
  },
  compute: {
    host: "AgentCoreRuntime",
    implementation: { language: "Python", path: "tools", handler: "handler.main" },
  },
} as const;
const unsupportedCollections = [
  "abTests",
  "datasets",
  "unassignedTargets",
  "capacityProviders",
  "httpGateways",
];

describe("v0 project compatibility", () => {
  test.each([undefined, "CustomOauth2", "GithubOauth2"])(
    "loads imported v0 OAuth credentials with vendor %j without creation settings",
    (vendor) => {
      const credential = {
        name: "imported",
        authorizerType: "OAuthCredentialProvider" as const,
        ...(vendor ? { vendor } : {}),
      };
      const original = { name: "project", version: 1, credentials: [credential] };
      const before = JSON.stringify(original);

      expect(normalizeProjectSpec(original).credentials).toEqual([
        { ...credential, vendor: vendor ?? "CustomOauth2" },
      ]);
      expect(JSON.stringify(original)).toBe(before);
      expect(LegacyCompatibleProjectSpecSchema.safeParse({ ...original, version: 2 }).success).toBe(
        false,
      );
    },
  );

  test("still rejects secrets in legacy OAuth provider configuration", () => {
    const result = LegacyCompatibleProjectSpecSchema.safeParse({
      name: "project",
      version: 1,
      credentials: [
        {
          name: "oauth",
          authorizerType: "OAuthCredentialProvider",
          providerConfig: { customOauth2ProviderConfig: { clientSecret: "secret" } },
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("must not contain secret material");
    }
  });

  test.each([
    [{ name: "project", version: 1 }, true],
    [{ name: "project", version: 2 }, false],
    [{ name: "project", version: 3 }, false],
    [{ name: "project", version: "1" }, false],
    [{ name: "project" }, false],
    [null, false],
    [undefined, false],
    [[], false],
    [1, false],
  ] as const)("detects v0 configuration %j as %j", (value, expected) => {
    expect(isV0ProjectSpec(value)).toBe(expected);
  });

  test("loads a v0 runtime project without changing the original configuration", () => {
    const original = {
      $schema: "https://aws.github.io/agentcore-cli/schemas/agentcore.schema.v1.json",
      name: "project",
      version: 1,
      runtimes: [runtime],
      memories: [{ name: "memory", eventExpiryDuration: 30, strategies: [] }],
      credentials: [{ name: "key", authorizerType: "ApiKeyCredentialProvider" }],
      ...Object.fromEntries(unsupportedCollections.map((field) => [field, []])),
    };
    const before = JSON.stringify(original);

    const project = normalizeProjectSpec(original);

    expect(project).toMatchObject({
      name: "project",
      version: 2,
      managedBy: "CDK",
      runtimes: [runtime],
      memories: original.memories,
      credentials: original.credentials,
    });
    expect(project).not.toHaveProperty("$schema");
    for (const field of unsupportedCollections) expect(project).not.toHaveProperty(field);
    expect(JSON.stringify(original)).toBe(before);
    project.runtimes[0]!.name = "changed";
    expect(original.runtimes[0]!.name).toBe("agent");
  });

  test("loads v0 MCP runtime tools under the current resource name", () => {
    const original = { name: "project", version: 1, mcpRuntimeTools: [toolRuntime] };
    const project = normalizeProjectSpec(original);
    expect(project.toolRuntimes).toEqual([toolRuntime]);
    expect(project).not.toHaveProperty("mcpRuntimeTools");
    expect(original.mcpRuntimeTools).toEqual([toolRuntime]);
  });

  test("rejects conflicting runtime tool collections instead of dropping one", () => {
    const result = LegacyCompatibleProjectSpecSchema.safeParse({
      name: "project",
      version: 1,
      mcpRuntimeTools: [toolRuntime],
      toolRuntimes: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "both 'mcpRuntimeTools' and 'toolRuntimes'",
      );
    }
  });

  test.each(unsupportedCollections)("rejects v0 projects containing %s", (field) => {
    const result = LegacyCompatibleProjectSpecSchema.safeParse({
      name: "project",
      version: 1,
      [field]: [{ name: "legacy" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: [field],
          message: expect.stringContaining(`'${field}' are not supported`),
        }),
      );
    }
  });

  test.each([
    { $schema: null },
    { abTests: null },
    { datasets: "invalid" },
    { mcpRuntimeTools: "invalid" },
    { runtimes: [null] },
    { runtimes: [{ ...runtime, filesystemConfigurations: [null] }] },
    { unknownCollection: [] },
  ])("validates malformed v0 configuration %j", (fields) => {
    expect(
      LegacyCompatibleProjectSpecSchema.safeParse({ name: "project", version: 1, ...fields })
        .success,
    ).toBe(false);
  });

  test.each([
    [
      { ...runtime, capacityProviderConfiguration: { name: "capacity" } },
      "capacity provider runtimes",
    ],
    [
      {
        ...runtime,
        filesystemConfigurations: [
          { capacityProviderVolume: { volumeName: "data", mountPath: "/mnt/data" } },
        ],
      },
      "capacity provider volume mounts",
    ],
    [
      {
        ...runtime,
        build: "Container",
        networkMode: "VPC",
        networkConfig: { subnets: ["subnet-12345678"], securityGroups: ["sg-12345678"] },
      },
      "without networkConfig.vpcId",
    ],
  ] as const)("reports an unsupported v0 runtime %j", (legacyRuntime, message) => {
    const result = LegacyCompatibleProjectSpecSchema.safeParse({
      name: "project",
      version: 1,
      runtimes: [legacyRuntime],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(message);
      expect(result.error.issues[0]?.message).toContain("Use the v0 CLI");
    }
  });

  test("loads a v0 Container runtime with complete VPC configuration", () => {
    const project = normalizeProjectSpec({
      name: "project",
      version: 1,
      runtimes: [
        {
          ...runtime,
          build: "Container",
          networkMode: "VPC",
          networkConfig: {
            subnets: ["subnet-12345678"],
            securityGroups: ["sg-12345678"],
            vpcId: "vpc-12345678",
          },
        },
      ],
    });
    expect(project.runtimes[0]?.networkConfig?.vpcId).toBe("vpc-12345678");
  });

  test("validates current project configuration normally", () => {
    expect(
      normalizeProjectSpec({ name: "project", version: 2, runtimes: [runtime] }),
    ).toMatchObject({ version: 2, runtimes: [runtime] });
  });

  test.each([
    { version: 2, $schema: "legacy" },
    { version: 2, mcpRuntimeTools: [] },
    { version: 2, abTests: [] },
    { version: 2, unknownCollection: [] },
    { version: 3 },
    { version: "1" },
    {},
  ])("preserves strict validation outside v0 for %j", (fields) => {
    expect(
      LegacyCompatibleProjectSpecSchema.safeParse({ name: "project", ...fields }).success,
    ).toBe(false);
  });
});
