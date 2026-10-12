import { ProjectSpecSchema, type ProjectSpec } from "./project";
import {
  ApiKeyCredentialSchema,
  OAuthCredentialSchema,
  PaymentCredentialSchema,
} from "./credential";
import { uniqueBy } from "./zod-util";
import { z } from "zod";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isV0ProjectSpec(value: unknown): value is Record<string, unknown> & { version: 1 } {
  return isRecord(value) && value.version === 1;
}

function unsupportedCollection(field: string) {
  return z
    .array(z.unknown())
    .max(0, `v0 projects with '${field}' are not supported by this CLI. Use the v0 CLI.`)
    .optional();
}

const LegacyProjectFieldsSchema = z
  .object({
    $schema: z.string().optional(),
    abTests: unsupportedCollection("abTests"),
    datasets: unsupportedCollection("datasets"),
    unassignedTargets: unsupportedCollection("unassignedTargets"),
    capacityProviders: unsupportedCollection("capacityProviders"),
    httpGateways: unsupportedCollection("httpGateways"),
  })
  .passthrough()
  .superRefine((project, ctx) => {
    if (project.mcpRuntimeTools !== undefined && project.toolRuntimes !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["toolRuntimes"],
        message: "A v0 project cannot define both 'mcpRuntimeTools' and 'toolRuntimes'.",
      });
    }

    if (!Array.isArray(project.runtimes)) return;
    for (const [runtimeIndex, runtime] of project.runtimes.entries()) {
      if (!isRecord(runtime)) continue;

      if (runtime.capacityProviderConfiguration !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["runtimes", runtimeIndex, "capacityProviderConfiguration"],
          message: "v0 capacity provider runtimes are not supported by this CLI. Use the v0 CLI.",
        });
      }
      if (Array.isArray(runtime.filesystemConfigurations)) {
        for (const [mountIndex, mount] of runtime.filesystemConfigurations.entries()) {
          if (isRecord(mount) && "capacityProviderVolume" in mount) {
            ctx.addIssue({
              code: "custom",
              path: ["runtimes", runtimeIndex, "filesystemConfigurations", mountIndex],
              message:
                "v0 capacity provider volume mounts are not supported by this CLI. Use the v0 CLI.",
            });
          }
        }
      }
      if (
        runtime.build === "Container" &&
        runtime.networkMode === "VPC" &&
        isRecord(runtime.networkConfig) &&
        runtime.networkConfig.vpcId === undefined
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["runtimes", runtimeIndex, "networkConfig", "vpcId"],
          message:
            "v0 Container runtimes in a VPC without networkConfig.vpcId are not supported by this CLI. Use the v0 CLI.",
        });
      }
    }
  });

const LegacyOAuthCredentialSchema = z
  .object(OAuthCredentialSchema.shape)
  .superRefine((credential, ctx) => {
    if (credential.providerConfig === undefined) return;
    const parsed = OAuthCredentialSchema.safeParse(credential);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ ...issue });
    }
  });

const LegacyProjectSpecSchema = ProjectSpecSchema.safeExtend({
  credentials: z
    .array(
      z.discriminatedUnion("authorizerType", [
        ApiKeyCredentialSchema,
        LegacyOAuthCredentialSchema,
        PaymentCredentialSchema,
      ]),
    )
    .default([])
    .superRefine(
      uniqueBy<{ name: string }>(
        ({ name }) => name,
        (name) => `Duplicate credential name: ${name}`,
      ),
    ),
});

/** Adapts the supported v0 configuration in memory; the original CDK app still reads its file. */
export const LegacyCompatibleProjectSpecSchema = z.unknown().transform((value, ctx) => {
  if (!isV0ProjectSpec(value)) {
    const parsed = ProjectSpecSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues) ctx.addIssue({ ...issue });
    return z.NEVER;
  }

  const legacy = LegacyProjectFieldsSchema.safeParse(value);
  if (!legacy.success) {
    for (const issue of legacy.error.issues) ctx.addIssue({ ...issue });
    return z.NEVER;
  }

  const {
    $schema: _schema,
    abTests: _abTests,
    datasets: _datasets,
    unassignedTargets: _unassignedTargets,
    capacityProviders: _capacityProviders,
    httpGateways: _httpGateways,
    mcpRuntimeTools,
    ...project
  } = legacy.data;
  const parsed = LegacyProjectSpecSchema.safeParse({
    ...project,
    version: 2,
    ...(mcpRuntimeTools === undefined ? {} : { toolRuntimes: mcpRuntimeTools }),
  });
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) ctx.addIssue({ ...issue });
  return z.NEVER;
});

export function normalizeProjectSpec(value: unknown): ProjectSpec {
  return LegacyCompatibleProjectSpecSchema.parse(value);
}
