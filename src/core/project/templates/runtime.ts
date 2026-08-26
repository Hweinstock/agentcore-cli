import { FsTreeNode } from "./fsTree";
import type { AssetSource } from "../source";
import type { RuntimeResourceConfig } from "../../../handlers/project/add/runtime/types";
import type { ProjectRuntime } from "../../../projectSchemas/runtime";
import type { TemplateRenderer, TemplateResolver } from "./types";
import type { ScaffoldRuntimeInput } from "../../../handlers/project/types";
import { InputValidationError } from "../../../errors";

function buildRuntimeSpec(input: RuntimeResourceConfig): ProjectRuntime {
  const { scaffoldRuntimeInput, name, ...infra } = input;
  return {
    name,
    build: scaffoldRuntimeInput.build,
    entrypoint: "main.py",
    codeLocation: `app/${name}` as ProjectRuntime["codeLocation"],
    ...(scaffoldRuntimeInput.build === "CodeZip" && { runtimeVersion: "PYTHON_3_14" as const }),
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
    ...(infra.runtimeVersion && { runtimeVersion: infra.runtimeVersion }),
  };
}

function buildResolverKey(
  framework: ScaffoldRuntimeInput["framework"],
  language: ScaffoldRuntimeInput["language"],
): `${ScaffoldRuntimeInput["framework"]}/${ScaffoldRuntimeInput["language"]}` {
  return `${framework}/${language}`;
}

const getTemplateResolvers = (assetSource: AssetSource, templateRenderer: TemplateRenderer) => ({
  "none/Python": async (input: RuntimeResourceConfig) => {
    const tree = await FsTreeNode.fromAssetSource(
      assetSource,
      input.scaffoldRuntimeInput.build === "Container"
        ? "templates/hello-world-python-container"
        : "templates/hello-world-python",
      input.name,
    );
    return { tree, spec: { runtimes: [buildRuntimeSpec(input)] } };
  },
  "strands/Python": async (input: RuntimeResourceConfig) => {
    if (input.protocol !== undefined && input.protocol !== "HTTP")
      throw new InputValidationError("the strands-python template only supports HTTP");

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
      name: input.name,
      projectName: input.name,
      Name: input.name,
      sdkFramework: "Strands",
      targetLanguage: "Python",
      modelProvider: input.scaffoldRuntimeInput.modelProvider,
      hasMemory: input.scaffoldRuntimeInput.memory !== "none",
      hasIdentity: false,
      hasGateway: false,
      hasPayment: false,
      isVpc: input.networkMode === "VPC",
      buildType: input.scaffoldRuntimeInput.build,
      memoryProviders: [],
      identityProviders: [],
      gatewayProviders: [],
      gatewayAuthTypes: [],
      protocol: "HTTP",
      sessionStorageMountPath,
      efsMounts,
      s3Mounts,
      needsOs: filesystemConfigurations.length > 0,
      enableOtel: true,
      hasConfigBundle: false,
    };
    const tree = await FsTreeNode.fromAssetSource(
      assetSource,
      "templates/strands-http-python",
      input.name,
      (raw) => templateRenderer.render(raw, context),
    );
    return {
      tree,
      spec: { runtimes: [{ ...buildRuntimeSpec(input), protocol: "HTTP" as const }] },
    };
  },
});

type GetRuntimeTemplateResolverConfig = {
  assetSource: AssetSource;
  templateRenderer: TemplateRenderer;
};

/** Given the parameters for rendering, load {@link TemplateResolver} that resolves to the correct template **/
export function getRuntimeTemplateResolver(
  config: GetRuntimeTemplateResolverConfig,
  input: RuntimeResourceConfig,
): TemplateResolver<RuntimeResourceConfig> | undefined {
  const { framework, language } = input.scaffoldRuntimeInput;
  const key = buildResolverKey(framework, language);

  const resolve = getTemplateResolvers(config.assetSource, config.templateRenderer)[key];
  if (!resolve) return undefined;
  return { resolve };
}
