import z from "zod";
import { createHandler, flag, ProjectKey } from "../../../../router";
import type { AddProjectResourceConfig } from "../types";
import { parseJsonFlag } from "../../../utils";
import { InputValidationError } from "../../../../errors";
import type {
  AuthorizerConfiguration,
  FilesystemConfiguration,
  LifecycleConfiguration,
  NetworkConfiguration,
  ProtocolConfiguration,
  RequestHeaderConfiguration,
} from "@aws-sdk/client-bedrock-agentcore-control";
import {
  type EnvVar,
  type FilesystemConfiguration as ProjectFilesystemConfiguration,
  type LifecycleConfiguration as ProjectLifecycleConfiguration,
  type NetworkConfig,
  BuildTypeSchema,
} from "../../../../projectSchemas/runtime";
import type { AuthorizerConfig, RuntimeAuthorizerType } from "../../../../projectSchemas/auth";
import {
  type NetworkMode,
  type ProtocolMode,
  RuntimeVersionSchema,
} from "../../../../projectSchemas/constants";
import { RUNTIME_TEMPLATES } from "../../types";

export const createAddRuntimeHandler = (config: AddProjectResourceConfig) =>
  createHandler({
    name: "runtime",
    description: "adds a runtime to the current project either from a template or BYO",
    flags: [
      flag("name", "the name of the runtime", z.string().optional()),
      flag("description", "description of the runtime", z.string().optional()),
      flag("template", "runtime template to scaffold from", z.enum(RUNTIME_TEMPLATES).optional()),
      flag("code-location", "path to existing agent source code (BYO path)", z.string().optional()),
      flag("build", "build type: CodeZip or Container (BYO only)", BuildTypeSchema.optional()),
      flag("entrypoint", "entrypoint file, e.g. main.py:handler (BYO only)", z.string().optional()),
      flag(
        "runtime-version",
        "language runtime, e.g. PYTHON_3_13, NODE_22 (BYO CodeZip only)",
        RuntimeVersionSchema.optional(),
      ),
      flag(
        "dockerfile",
        "dockerfile for the container build (BYO Container only)",
        z.string().optional(),
      ),
      flag(
        "build-context-path",
        "docker build context directory relative to project root (BYO Container only)",
        z.string().optional(),
      ),
      flag(
        "custom-docker-build-args",
        "docker build args as JSON key/value object (BYO Container only)",
        z.string().optional(),
      ),
      flag(
        "role-arn",
        "IAM role ARN that provides permissions for the runtime",
        z.string().optional(),
      ),
      flag(
        "additional-policies",
        "additional IAM policy ARNs or policy document paths",
        z.array(z.string()).optional(),
      ),
      flag(
        "network-configuration",
        "network configuration (JSON NetworkConfiguration)",
        z.string().optional(),
      ),
      flag(
        "vpc-id",
        "VPC ID for Container builds in VPC mode (CodeBuild cannot infer it from subnets)",
        z.string().optional(),
      ),
      flag(
        "authorizer-configuration",
        "inbound authorizer configuration (JSON AuthorizerConfiguration)",
        z.string().optional(),
      ),
      flag(
        "protocol-configuration",
        "protocol configuration (JSON ProtocolConfiguration)",
        z.string().optional(),
      ),
      flag(
        "request-header-configuration",
        "request header passthrough configuration (JSON RequestHeaderConfiguration)",
        z.string().optional(),
      ),
      flag(
        "lifecycle-configuration",
        "lifecycle configuration (JSON LifecycleConfiguration)",
        z.string().optional(),
      ),
      flag(
        "environment-variables",
        "environment variables (JSON object of key/value strings)",
        z.string().optional(),
      ),
      flag(
        "filesystem-configurations",
        "filesystem mount configurations (JSON FilesystemConfiguration[])",
        z.string().optional(),
      ),
      flag("tags", "tags to apply (JSON object of key/value strings)", z.string().optional()),
    ],
    handle: async (ctx, flags) => {
      if (!flags.name)
        throw new InputValidationError("required option '--name <name>' not specified");

      const sourceCount = [flags.template, flags["code-location"]].filter(Boolean).length;
      if (sourceCount !== 1)
        throw new InputValidationError("exactly one of --template or --code-location is required");

      const inputNetwork = parseJsonFlag<NetworkConfiguration>(
        "network-configuration",
        flags["network-configuration"],
      );
      const inputAuthConfig = parseJsonFlag<AuthorizerConfiguration>(
        "authorizer-configuration",
        flags["authorizer-configuration"],
      );
      const inputProtocol = parseJsonFlag<ProtocolConfiguration>(
        "protocol-configuration",
        flags["protocol-configuration"],
      );
      const inputRequestHeaders = parseJsonFlag<RequestHeaderConfiguration>(
        "request-header-configuration",
        flags["request-header-configuration"],
      );
      const inputLifecycle = parseJsonFlag<LifecycleConfiguration>(
        "lifecycle-configuration",
        flags["lifecycle-configuration"],
      );
      const inputFilesystems = parseJsonFlag<FilesystemConfiguration[]>(
        "filesystem-configurations",
        flags["filesystem-configurations"],
      );
      const inputEnvironmentVariables = parseJsonFlag<Record<string, string>>(
        "environment-variables",
        flags["environment-variables"],
      );

      // TODO: make entrypoint optional since container agents don't need it.
      const entrypoint = flags.entrypoint ?? "main.py";

      const network = toNetwork(inputNetwork);

      if (flags["custom-docker-build-args"] && !flags.dockerfile && !flags["build-context-path"])
        throw new InputValidationError(
          "--custom-docker-build-args requires --dockerfile or --build-context-path",
        );

      if (flags["vpc-id"] && !network?.networkConfig)
        throw new InputValidationError(
          "--vpc-id requires --network-configuration with VPC network configuration",
        );

      const auth = toAuthorizer(inputAuthConfig);
      const protocol = toProtocol(inputProtocol);
      const requestHeaderAllowlist = toRequestHeaderAllowlist(inputRequestHeaders);
      const lifecycleConfiguration = toLifecycle(inputLifecycle);
      const filesystemConfigurations = toFilesystems(inputFilesystems);

      const infraConfig = {
        name: flags.name,
        description: flags.description,
        executionRoleArn: flags["role-arn"],
        additionalPolicies: flags["additional-policies"],
        envVars: toEnvironmentVariables(inputEnvironmentVariables),
        networkMode: network?.networkMode,
        networkConfig: network?.networkConfig
          ? { ...network.networkConfig, ...(flags["vpc-id"] ? { vpcId: flags["vpc-id"] } : {}) }
          : undefined,
        authorizerType: auth?.authorizerType,
        authorizerConfiguration: auth?.authorizerConfiguration,
        protocol,
        requestHeaderAllowlist,
        lifecycleConfiguration,
        filesystemConfigurations,
        tags: parseJsonFlag<Record<string, string>>("tags", flags["tags"]),
      };

      const runtimeConfig = flags.template
        ? { source: "template" as const, template: flags.template, ...infraConfig }
        : {
            source: "byo" as const,
            codeLocation: flags["code-location"]!,
            build: flags.build,
            entrypoint,
            runtimeVersion: flags["runtime-version"],
            dockerfile: flags.dockerfile,
            buildContextPath: flags["build-context-path"],
            customDockerBuildArgs: parseJsonFlag<Record<string, string>>(
              "custom-docker-build-args",
              flags["custom-docker-build-args"],
            ),
            ...infraConfig,
          };

      const project = ctx.require(ProjectKey);
      for await (const event of config.projectManager.addResource(project, {
        resourceType: "runtime",
        resourceConfig: runtimeConfig,
      })) {
        config.io.stderr.write(`${event.message}\n`);
      }

      config.io.stderr.write(`added runtime '${flags.name}' to '${project.name}'\n`);
    },
  });

/** Converts API flat {key: value} map to project schema [{name, value}] array. */
function toEnvironmentVariables(envVars: Record<string, string> | undefined): EnvVar[] {
  return envVars ? Object.entries(envVars).map(([name, value]) => ({ name, value })) : [];
}

/** Converts API NetworkConfiguration to project schema networkMode + networkConfig fields. */
function toNetwork(
  network: NetworkConfiguration | undefined,
): { networkMode: NetworkMode; networkConfig: NetworkConfig | undefined } | undefined {
  if (!network) return undefined;
  return {
    networkMode: network.networkMode as NetworkMode,
    networkConfig: network.networkModeConfig
      ? {
          subnets: network.networkModeConfig.subnets ?? [],
          securityGroups: network.networkModeConfig.securityGroups ?? [],
        }
      : undefined,
  };
}

/** Converts API AuthorizerConfiguration union to project schema authorizerType + authorizerConfiguration. */
function toAuthorizer(
  auth: AuthorizerConfiguration | undefined,
):
  { authorizerType: RuntimeAuthorizerType; authorizerConfiguration: AuthorizerConfig } | undefined {
  if (!auth) return undefined;
  if ("customJWTAuthorizer" in auth && auth.customJWTAuthorizer) {
    const c = auth.customJWTAuthorizer;
    if (!c.discoveryUrl)
      throw new InputValidationError("discoveryUrl is required in authorizer configuration");
    return {
      authorizerType: "CUSTOM_JWT",
      authorizerConfiguration: {
        customJwtAuthorizer: {
          discoveryUrl: c.discoveryUrl,
          allowedAudience: c.allowedAudience,
          allowedClients: c.allowedClients,
          allowedScopes: c.allowedScopes,
        },
      },
    };
  }
  throw new InputValidationError("Unrecognized authorizer configuration variant");
}

/** Converts API ProtocolConfiguration wrapper to project schema ProtocolMode enum. */
function toProtocol(protocol: ProtocolConfiguration | undefined): ProtocolMode | undefined {
  if (!protocol) return undefined;
  return protocol.serverProtocol as ProtocolMode;
}

/** Unwraps API RequestHeaderConfiguration union to project schema string[]. */
function toRequestHeaderAllowlist(
  headers: RequestHeaderConfiguration | undefined,
): string[] | undefined {
  if (!headers) return undefined;
  if ("requestHeaderAllowlist" in headers && headers.requestHeaderAllowlist) {
    return headers.requestHeaderAllowlist;
  }
  throw new InputValidationError("Unrecognized request header configuration variant");
}

/** Converts API LifecycleConfiguration to project schema LifecycleConfiguration. */
function toLifecycle(
  lifecycle: LifecycleConfiguration | undefined,
): ProjectLifecycleConfiguration | undefined {
  if (!lifecycle) return undefined;
  return {
    idleRuntimeSessionTimeout: lifecycle.idleRuntimeSessionTimeout,
    maxLifetime: lifecycle.maxLifetime,
  };
}

/** Converts API FilesystemConfiguration[] tagged unions to project schema format. */
function toFilesystems(
  filesystems: FilesystemConfiguration[] | undefined,
): ProjectFilesystemConfiguration[] | undefined {
  if (!filesystems || filesystems.length === 0) return undefined;
  return filesystems.map((fs): ProjectFilesystemConfiguration => {
    if ("sessionStorage" in fs && fs.sessionStorage) {
      return { sessionStorage: { mountPath: fs.sessionStorage.mountPath! } };
    }
    if ("efsAccessPoint" in fs && fs.efsAccessPoint) {
      return {
        efsAccessPoint: {
          accessPointArn: fs.efsAccessPoint.accessPointArn!,
          mountPath: fs.efsAccessPoint.mountPath!,
        },
      };
    }
    if ("s3FilesAccessPoint" in fs && fs.s3FilesAccessPoint) {
      return {
        s3FilesAccessPoint: {
          accessPointArn: fs.s3FilesAccessPoint.accessPointArn!,
          mountPath: fs.s3FilesAccessPoint.mountPath!,
        },
      };
    }
    throw new InputValidationError("Unrecognized filesystem configuration variant");
  });
}
