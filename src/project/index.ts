export type { Project, ProjectManager } from './types';
export { getDefaultProjectManager as getProjectManager } from './manager';
export { getAgentTemplateRenderer } from './templates';
export type { AgentTemplateValues, TemplateRenderer } from './templates';

// each module owns its own testing utilities. This helps keep them self-contained.
export * as ProjectTestingHelpers from './testing';
