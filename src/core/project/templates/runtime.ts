import { FsTreeNode } from "./fsTree";
import type { AssetSource } from "../source";
import type { RuntimeResourceConfig } from "../../../handlers/project/add/runtime/types";
import type { ProjectRuntime } from "../../../projectSchemas/runtime";
import type { SpecEntries, TemplateRenderer, TemplateResolver } from "./types";
import type { EnvLocalEntry, ScaffoldRuntimeInput } from "../../../handlers/project/types";
import { credentialEnvVarName } from "../../../projectSchemas/credential";
import { InputValidationError } from "../../../errors";
import { toPythonPackageName } from "../fsUtils";

/**
 * The AgentCore Identity wiring a non-Bedrock model provider needs: a Handlebars
 * context fragment naming the credential the generated `model/load` reads, the
 * `ApiKeyCredentialProvider` credential to register in agentcore.json, and the
 * API-key value to write to agentcore/.env.local. Bedrock uses the runtime's IAM
 * credentials, so it contributes none of these.
 */
type ModelProviderIdentity = {
  context: { hasIdentity: boolean; identityProviders: { name: string; envVarName: string }[] };
  credentials: NonNullable<SpecEntries["credentials"]>;
  envEntries: EnvLocalEntry[];
};

function resolveModelProviderIdentity(input: RuntimeResourceConfig): ModelProviderIdentity {
  const { modelProvider, apiKey } = input.scaffoldRuntimeInput;
  if (modelProvider === "Bedrock") {
    return {
      context: { hasIdentity: false, identityProviders: [] },
      credentials: [],
      envEntries: [],
    };
  }
  const credentialName = `${input.name}${modelProvider}ApiKey`;
  const envVarName = credentialEnvVarName(credentialName);
  return {
    context: { hasIdentity: true, identityProviders: [{ name: credentialName, envVarName }] },
    credentials: [{ authorizerType: "ApiKeyCredentialProvider", name: credentialName }],
    envEntries: apiKey
      ? [
          {
            key: envVarName,
            value: apiKey,
            comment: `API key for the ${modelProvider} model provider (runtime ${input.name})`,
          },
        ]
      : [],
  };
}

function buildRuntimeSpec(input: RuntimeResourceConfig): ProjectRuntime {
  const { scaffoldRuntimeInput, name, ...infra } = input;
  return {
    name,
    build: scaffoldRuntimeInput.build,
    // TypeScript deploys a compiled main.js (esbuild runs at synth); Python runs main.py directly.
    entrypoint: scaffoldRuntimeInput.language === "TypeScript" ? "main.js" : "main.py",
    codeLocation: `app/${name}` as ProjectRuntime["codeLocation"],
    ...(scaffoldRuntimeInput.runtimeVersion && {
      runtimeVersion: scaffoldRuntimeInput.runtimeVersion,
    }),
    ...(scaffoldRuntimeInput.build === "Container" && { dockerfile: "Dockerfile" }),
    ...(infra.description && { description: infra.description }),
    ...(infra.executionRoleArn && { executionRoleArn: infra.executionRoleArn }),
    ...(infra.additionalPolicies && { additionalPolicies: infra.additionalPolicies }),
    ...(infra.envVars && { envVars: infra.envVars }),
    ...(infra.networkMode && { networkMode: infra.networkMode }),
    ...(infra.networkConfig && { networkConfig: infra.networkConfig }),
    ...(infra.authorizerType && { authorizerType: infra.authorizerType }),
    ...(infra.authorizerConfiguration && {
      authorizerConfiguration: infra.authorizerConfiguration,
    }),
    ...(infra.protocol && { protocol: infra.protocol }),
    ...(infra.requestHeaderAllowlist && { requestHeaderAllowlist: infra.requestHeaderAllowlist }),
    ...(infra.lifecycleConfiguration && { lifecycleConfiguration: infra.lifecycleConfiguration }),
    ...(infra.filesystemConfigurations && {
      filesystemConfigurations: infra.filesystemConfigurations,
    }),
    ...(infra.tags && { tags: infra.tags }),
  };
}

/**
 * Normalize a name for use as an npm package name.
 *
 * @param name - The raw runtime/project name to normalize.
 * @returns An npm-safe package name.
 * @see {@link https://github.com/npm/validate-npm-package-name} for npm's package name rules.
 */
function toNpmPackageName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "");
}

function buildResolverKey(
  framework: ScaffoldRuntimeInput["framework"],
  language: ScaffoldRuntimeInput["language"],
  protocol: ScaffoldRuntimeInput["protocol"],
): `${ScaffoldRuntimeInput["framework"]}/${ScaffoldRuntimeInput["language"]}/${NonNullable<ScaffoldRuntimeInput["protocol"]>}` {
  return `${framework}/${language}/${protocol ?? "HTTP"}`;
}

const importBedrockAgentResolver = () => async (input: RuntimeResourceConfig) => {
  const imported = input.importBedrockAgent!;
  if (input.protocol !== undefined && input.protocol !== "HTTP")
    throw new InputValidationError("an imported Bedrock Agent only supports HTTP");

  const tree = FsTreeNode.createDirectory(
    input.name,
    Object.entries(imported.files).map(([name, content]) => {
      if (name.includes("/") || name === "." || name === "..") {
        throw new InputValidationError(`unsafe imported file name: '${name}'`);
      }
      return FsTreeNode.createFile(name, async () => content);
    }),
  );

  const memory = input.scaffoldRuntimeInput.memory;
  return {
    tree,
    spec: {
      runtimes: [{ ...buildRuntimeSpec(input), protocol: "HTTP" as const }],
      ...(memory && { memories: [memory] }),
    },
  };
};

const getTemplateResolvers = (assetSource: AssetSource, templateRenderer: TemplateRenderer) => ({
  [buildResolverKey("none", "Python", "HTTP")]: async (input: RuntimeResourceConfig) => {
    if (input.scaffoldRuntimeInput.memory !== undefined)
      throw new InputValidationError(`memory is not supported with the agent-python template`);
    const isContainer = input.scaffoldRuntimeInput.build === "Container";
    const tree = await FsTreeNode.fromAssetSource(
      { assetSource },
      { assetDir: "templates/agent-python" },
      {
        rootDirName: input.name,
        filter: (name) => {
          if (name === "Dockerfile" || name === ".dockerignore") return isContainer;
          return true;
        },
      },
    );
    return { tree, spec: { runtimes: [buildRuntimeSpec(input)] } };
  },
  [buildResolverKey("strands", "Python", "HTTP")]: async (input: RuntimeResourceConfig) => {
    const filesystemConfigurations = input.filesystemConfigurations ?? [];
    const sessionStorageMountPath = filesystemConfigurations.flatMap((configuration) =>
      "sessionStorage" in configuration ? [configuration.sessionStorage.mountPath] : [],
    )[0];
    const efsMounts = filesystemConfigurations.flatMap((configuration) =>
      "efsAccessPoint" in configuration
        ? [{ mountPath: configuration.efsAccessPoint.mountPath }]
        : [],
    );
    const s3Mounts = filesystemConfigurations.flatMap((configuration) =>
      "s3FilesAccessPoint" in configuration
        ? [{ mountPath: configuration.s3FilesAccessPoint.mountPath }]
        : [],
    );
    const memory = input.scaffoldRuntimeInput.memory;
    const identity = resolveModelProviderIdentity(input);
    const context = {
      name: toPythonPackageName(input.name),
      modelProvider: input.scaffoldRuntimeInput.modelProvider,
      hasMemory: memory !== undefined,
      // the CDK injects this env var corresponding to the actual ID once its resolved on deployment.
      memoryEnvVarName: memory ? `MEMORY_${memory.name.toUpperCase()}_ID` : undefined,
      memoryStrategies: memory?.strategies.map(({ type }) => type) ?? [],
      ...identity.context,
      hasGateway: false,
      hasPayment: false,
      isVpc: input.networkMode === "VPC",
      gatewayProviders: [],
      gatewayAuthTypes: [],
      sessionStorageMountPath,
      efsMounts,
      s3Mounts,
      needsOs: filesystemConfigurations.length > 0,
      hasConfigBundle: false,
      enableOtel: true,
      // The strands template's entrypoint is fixed to main.py; the container Dockerfile launches it as the `main` module.
      entrypoint: "main",
    };
    const isContainer = input.scaffoldRuntimeInput.build === "Container";
    const tree = await FsTreeNode.fromAssetSource(
      { assetSource },
      { assetDir: "templates/agent-python-strands" },
      {
        rootDirName: input.name,
        transformContent: (raw) => templateRenderer.render(raw, context),
        filter: (name, isDir) => {
          if (isDir && name === "memory") return memory !== undefined;
          if (name === "Dockerfile" || name === ".dockerignore") return isContainer;
          return true;
        },
      },
    );
    return {
      tree,
      spec: {
        runtimes: [{ ...buildRuntimeSpec(input), protocol: "HTTP" as const }],
        ...(memory && { memories: [memory] }),
        ...(identity.credentials.length > 0 && { credentials: identity.credentials }),
      },
      ...(identity.envEntries.length > 0 && { envEntries: identity.envEntries }),
    };
  },
  [buildResolverKey("strands", "TypeScript", "HTTP")]: async (input: RuntimeResourceConfig) => {
    if (input.protocol !== undefined && input.protocol !== "HTTP")
      throw new InputValidationError("the agent-typescript-strands template only supports HTTP");

    const memory = input.scaffoldRuntimeInput.memory;
    // The TypeScript strands SDK's createAgentCoreMemoryStores requires at least one
    // namespace, so short-term-only memory (no long-term strategies) is unsupported.
    // https://github.com/aws/bedrock-agentcore-sdk-typescript/blob/v0.3.0/src/memory/integrations/strands/factory.ts#L130-L133
    if (memory !== undefined && memory.strategies.length === 0)
      throw new InputValidationError(
        "the agent-typescript-strands template does not support short-term-only memory; add long-term strategies or use --memory none",
      );

    const identity = resolveModelProviderIdentity(input);
    const context = {
      name: toNpmPackageName(input.name),
      modelProvider: input.scaffoldRuntimeInput.modelProvider,
      hasMemory: memory !== undefined,
      // the CDK injects this env var corresponding to the actual ID once its resolved on deployment.
      memoryEnvVarName: memory ? `MEMORY_${memory.name.toUpperCase()}_ID` : undefined,
      memoryStrategies: memory?.strategies.map(({ type }) => type) ?? [],
      ...identity.context,
    };
    const isContainer = input.scaffoldRuntimeInput.build === "Container";
    const tree = await FsTreeNode.fromAssetSource(
      { assetSource },
      { assetDir: "templates/agent-typescript-strands" },
      {
        rootDirName: input.name,
        transformContent: (raw) => templateRenderer.render(raw, context),
        filter: (name, isDir) => {
          if (isDir && name === "memory") return memory !== undefined;
          if (name === "Dockerfile" || name === ".dockerignore") return isContainer;
          return true;
        },
      },
    );
    return {
      tree,
      spec: {
        runtimes: [{ ...buildRuntimeSpec(input), protocol: "HTTP" as const }],
        ...(memory && { memories: [memory] }),
        ...(identity.credentials.length > 0 && { credentials: identity.credentials }),
      },
      ...(identity.envEntries.length > 0 && { envEntries: identity.envEntries }),
    };
  },
  [buildResolverKey("none", "Python", "MCP")]: async (input: RuntimeResourceConfig) => {
    if (input.scaffoldRuntimeInput.memory !== undefined)
      throw new InputValidationError("memory is not supported with an MCP runtime");
    const filesystemConfigurations = input.filesystemConfigurations ?? [];
    const sessionStorageMountPath = filesystemConfigurations.flatMap((configuration) =>
      "sessionStorage" in configuration ? [configuration.sessionStorage.mountPath] : [],
    )[0];
    const efsMounts = filesystemConfigurations.flatMap((configuration) =>
      "efsAccessPoint" in configuration
        ? [{ mountPath: configuration.efsAccessPoint.mountPath }]
        : [],
    );
    const s3Mounts = filesystemConfigurations.flatMap((configuration) =>
      "s3FilesAccessPoint" in configuration
        ? [{ mountPath: configuration.s3FilesAccessPoint.mountPath }]
        : [],
    );
    const context = {
      name: toPythonPackageName(input.name),
      sessionStorageMountPath,
      efsMounts,
      s3Mounts,
      needsOs: filesystemConfigurations.length > 0,
      // The AgentCore Runtime requires OTEL dependencies to be present; the
      // container launches main.py as the `main` module under
      // opentelemetry-instrument, and FastMCP binds the streamable-HTTP server.
      enableOtel: true,
      entrypoint: "main",
    };
    const isContainer = input.scaffoldRuntimeInput.build === "Container";
    const tree = await FsTreeNode.fromAssetSource(
      { assetSource },
      { assetDir: "templates/mcp-python-fastmcp" },
      {
        rootDirName: input.name,
        transformContent: (raw) => templateRenderer.render(raw, context),
        filter: (name) => {
          if (name === "Dockerfile" || name === ".dockerignore") return isContainer;
          return true;
        },
      },
    );
    return {
      tree,
      spec: { runtimes: [{ ...buildRuntimeSpec(input), protocol: "MCP" as const }] },
    };
  },
  [buildResolverKey("strands", "Python", "A2A")]: async (input: RuntimeResourceConfig) => {
    const filesystemConfigurations = input.filesystemConfigurations ?? [];
    const sessionStorageMountPath = filesystemConfigurations.flatMap((configuration) =>
      "sessionStorage" in configuration ? [configuration.sessionStorage.mountPath] : [],
    )[0];
    const efsMounts = filesystemConfigurations.flatMap((configuration) =>
      "efsAccessPoint" in configuration
        ? [{ mountPath: configuration.efsAccessPoint.mountPath }]
        : [],
    );
    const s3Mounts = filesystemConfigurations.flatMap((configuration) =>
      "s3FilesAccessPoint" in configuration
        ? [{ mountPath: configuration.s3FilesAccessPoint.mountPath }]
        : [],
    );
    const memory = input.scaffoldRuntimeInput.memory;
    const identity = resolveModelProviderIdentity(input);
    const context = {
      name: toPythonPackageName(input.name),
      modelProvider: input.scaffoldRuntimeInput.modelProvider,
      hasMemory: memory !== undefined,
      // the CDK injects this env var corresponding to the actual ID once its resolved on deployment.
      memoryEnvVarName: memory ? `MEMORY_${memory.name.toUpperCase()}_ID` : undefined,
      memoryStrategies: memory?.strategies.map(({ type }) => type) ?? [],
      ...identity.context,
      sessionStorageMountPath,
      efsMounts,
      s3Mounts,
      needsOs: filesystemConfigurations.length > 0,
      // The AgentCore Runtime requires OTEL dependencies to be present; the
      // container launches main.py as the `main` module under
      // opentelemetry-instrument, and serve_a2a binds the A2A server on port 9000.
      enableOtel: true,
      entrypoint: "main",
    };
    const isContainer = input.scaffoldRuntimeInput.build === "Container";
    const tree = await FsTreeNode.fromAssetSource(
      { assetSource },
      { assetDir: "templates/a2a-python-strands" },
      {
        rootDirName: input.name,
        transformContent: (raw) => templateRenderer.render(raw, context),
        filter: (name, isDir) => {
          if (isDir && name === "memory") return memory !== undefined;
          if (name === "Dockerfile" || name === ".dockerignore") return isContainer;
          return true;
        },
      },
    );
    return {
      tree,
      spec: {
        runtimes: [{ ...buildRuntimeSpec(input), protocol: "A2A" as const }],
        ...(memory && { memories: [memory] }),
        ...(identity.credentials.length > 0 && { credentials: identity.credentials }),
      },
      ...(identity.envEntries.length > 0 && { envEntries: identity.envEntries }),
    };
  },
});

type GetRuntimeTemplateResolverConfig = {
  assetSource: AssetSource;
  templateRenderer: TemplateRenderer;
};

/** Given the parameters for rendering, load the {@link TemplateResolver} that resolves to the correct template **/
export function getRuntimeTemplateResolver(
  config: GetRuntimeTemplateResolverConfig,
  input: RuntimeResourceConfig,
): TemplateResolver<RuntimeResourceConfig> | undefined {
  // An imported Bedrock Agent carries a complete translated file plan, so it
  // bypasses the normal framework/language template lookup.
  if (input.importBedrockAgent) {
    return { resolve: importBedrockAgentResolver() };
  }

  const { framework, language, protocol } = input.scaffoldRuntimeInput;
  const key = buildResolverKey(framework, language, protocol);

  const resolve = getTemplateResolvers(config.assetSource, config.templateRenderer)[key];
  if (!resolve) return undefined;
  return { resolve };
}
