import { HarnessSpecSchema } from "../../projectSchemas/harness";
import type { ProjectSpecSchema } from "../../projectSchemas/project";
import type z from "zod";
import type {
  BuildType,
  EnvVar,
  FilesystemConfiguration,
  LifecycleConfiguration,
  NetworkConfig,
} from "../../projectSchemas/runtime";
import type { AuthorizerConfig, RuntimeAuthorizerType } from "../../projectSchemas/auth";
import type { NetworkMode, ProtocolMode, RuntimeVersion } from "../../projectSchemas/constants";

/** Available runtime templates for scaffolding agent code. A subset of {@link PROJECT_TEMPLATES} */
export const RUNTIME_TEMPLATES = {
  HELLO_WORLD_PYTHON: "hello-world-python",
  HELLO_WORLD_PYTHON_CONTAINER: "hello-world-python-container",
} as const;

export type RuntimeTemplate = (typeof RUNTIME_TEMPLATES)[keyof typeof RUNTIME_TEMPLATES];

/** Available project templates for scaffolding new AgentCore projects. */
export const PROJECT_TEMPLATES = {
  ...RUNTIME_TEMPLATES,
} as const;

export type ProjectTemplate = (typeof PROJECT_TEMPLATES)[keyof typeof PROJECT_TEMPLATES];

export type CreateProjectInput = {
  /** The name of the project; also the directory it is scaffolded into. */
  name: string;
  /** The project template to scaffold from. */
  template: ProjectTemplate;
  /** Skip installing dependencies (npm install, uv sync). */
  skipInstall?: boolean;
  /** Skip initializing a git repository. */
  skipGit?: boolean;
};

/** A progress step reported while a long-running project operation runs. */
export type ProjectEvent = {
  message: string;
};

export type ResolveProjectInput = {
  /** A path to search from when locating the project root. */
  filePath: string;
};

export type Project = {
  name: string;
  /** Absolute path to the project root (the parent of agentcore/). */
  rootPath: string;
  /** The spec of the project (agentcore.json loaded into memory) */
  spec: z.infer<typeof ProjectSpecSchema>;
};

/** Shared infrastructure config fields for a runtime (independent of source type). */
type RuntimeInfraConfig = {
  name: string;
  description?: string;
  executionRoleArn?: string;
  additionalPolicies?: string[];
  envVars?: EnvVar[];
  networkMode?: NetworkMode;
  networkConfig?: NetworkConfig;
  authorizerType?: RuntimeAuthorizerType;
  authorizerConfiguration?: AuthorizerConfig;
  protocol?: ProtocolMode;
  requestHeaderAllowlist?: string[];
  lifecycleConfiguration?: LifecycleConfiguration;
  filesystemConfigurations?: FilesystemConfiguration[];
  tags?: Record<string, string>;
};

/** BYO path: user provides existing code location and build config. */
type RuntimeByoConfig = RuntimeInfraConfig & {
  source: "byo";
  codeLocation: string;
  build?: BuildType;
  entrypoint?: string;
  runtimeVersion?: RuntimeVersion;
  dockerfile?: string;
  buildContextPath?: string;
  customDockerBuildArgs?: Record<string, string>;
};

/** Template path: CLI scaffolds agent code from a template. */
type RuntimeTemplateConfig = RuntimeInfraConfig & {
  source: "template";
  template: string;
};

export type RuntimeResourceConfig = RuntimeByoConfig | RuntimeTemplateConfig;

/** Discriminated union input for {@link ProjectManager.addResource}. */
export type AddResourceInput =
  | {
      resourceType: "harness";
      resourceConfig: z.input<typeof HarnessSpecSchema>;
    }
  | {
      resourceType: "runtime";
      resourceConfig: RuntimeResourceConfig;
    };

export type ProjectResource = AddResourceInput["resourceType"];

/**
 * The primary interface for interacting with projects
 */
export interface ProjectManager {
  /** Scaffold a new AgentCore project from the given template. */
  create(input: CreateProjectInput): AsyncGenerator<ProjectEvent, Project>;

  /** Compile the project's CDK app and synthesize its CloudFormation templates. */
  build(project: Project): AsyncGenerator<ProjectEvent, void>;

  /** Locate an existing AgentCore project. Returns undefined if no project can be found. */
  resolve(input: ResolveProjectInput): Promise<Project | undefined>;

  /** Add a resource to an existing AgentCore project. */
  addResource(project: Project, input: AddResourceInput): AsyncGenerator<ProjectEvent, Project>;
}
