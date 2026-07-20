export const PROJECT_TEMPLATES = ["placeholder"] as const;

export interface CreateProjectInput {
  template: (typeof PROJECT_TEMPLATES)[number];
}

export interface FindProjectInput {
  filePath: string;
}

export interface Project {}

export interface ProjectManager {
  create(input: CreateProjectInput): Promise<Project>;
  find(input: FindProjectInput): Promise<Project>;
}
