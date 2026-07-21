/** Available project templates for scaffolding new AgentCore projects. */
export const PROJECT_TEMPLATES = ["placeholder"] as const;

export type CreateProjectInput = {
  /** The project template to scaffold from. */
  template: (typeof PROJECT_TEMPLATES)[number];
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
