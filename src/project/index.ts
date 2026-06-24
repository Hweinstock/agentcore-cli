export type { Project, ProjectManager } from './types';
export { getDefaultProjectManager as getProjectManager } from './manager';
export { getAgentTemplateRenderer } from './templates';
export type { AgentTemplateValues, TemplateRenderer } from './templates';

export * as ProjectTestingHelpers from './testing';
