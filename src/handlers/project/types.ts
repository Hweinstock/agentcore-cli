/** Available project templates for scaffolding new AgentCore projects. */
export const PROJECT_TEMPLATES = {
  BAREBONES: "barebones",
} as const;

export type ProjectTemplate = (typeof PROJECT_TEMPLATES)[keyof typeof PROJECT_TEMPLATES];

export type CreateProjectInput = {
  /** The project template to scaffold from. */
  template: ProjectTemplate;
};

export type FindProjectInput = {
  /** A path to search from when locating the project root. */
  filePath: string;
};

/**
 * Exposes the ability to configure, develop, and deploy a resolved AgentCore project.  
 */
export interface Project {}

/**
 * Manages project lifecycle: creation (scaffolding) and discovery
 */
export interface ProjectManager {
  /** Scaffold a new AgentCore project from the given template. */
  create(input: CreateProjectInput): Promise<Project>;

  /** Locate an existing AgentCore project. Returns undefined if no project can be found. */
  find(input: FindProjectInput): Promise<Project | undefined>;
}
