import { type Logger, type Result, type TelemetryClient, ok } from '../../common';

export interface BuildProjectOptions {
  name?: string;
  projectName?: string;
  language?: string;
  framework?: string;
  agent?: boolean;
}

export interface Project {
  name: string;
}

export interface ProjectBuilder {
  build: (options: BuildProjectOptions) => Result<Project>;
}

export const getProjectBuilder = (props: { telemetryClient: TelemetryClient; logger: Logger }): ProjectBuilder => ({
  build: options => {
    const name = options.projectName ?? options.name ?? 'my-agent-project';
    props.logger.info(`building project ${name}`);
    return ok({ name });
  },
});
