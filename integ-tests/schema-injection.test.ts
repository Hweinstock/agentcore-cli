import { createTestProject, runCLI } from '../src/test-utils/index.js';
import type { TestProject } from '../src/test-utils/index.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCHEMA_URL_PATTERN = /^https:\/\/schema\.agentcore\.aws\.dev\/.+\.json$/;
async function readRawConfig(projectPath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(projectPath, 'agentcore', 'agentcore.json'), 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('integration: $schema injection in agentcore.json', () => {
  let project: TestProject;

  beforeAll(async () => {
    project = await createTestProject({
      language: 'Python',
      framework: 'Strands',
      modelProvider: 'Bedrock',
      memory: 'none',
    });
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it('new project has $schema set to the official URL as the first key', async () => {
    const config = await readRawConfig(project.projectPath);
    expect(config.$schema).toMatch(SCHEMA_URL_PATTERN);
    expect(Object.keys(config)[0]).toBe('$schema');
  });

  it('$schema persists after adding a resource', async () => {
    const memName = `SchemaMem${Date.now().toString().slice(-6)}`;
    await runCLI(['add', 'memory', '--name', memName, '--json'], project.projectPath);

    const config = await readRawConfig(project.projectPath);
    expect(config.$schema).toMatch(SCHEMA_URL_PATTERN);

    await runCLI(['remove', 'memory', '--name', memName, '--json'], project.projectPath);
  });

  it('does not overwrite a custom $schema value', async () => {
    const configPath = join(project.projectPath, 'agentcore', 'agentcore.json');
    const config = await readRawConfig(project.projectPath);
    const customUrl = 'https://example.com/custom-schema.json';
    config.$schema = customUrl;
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const memName = `CustomMem${Date.now().toString().slice(-6)}`;
    await runCLI(['add', 'memory', '--name', memName, '--json'], project.projectPath);

    const updated = await readRawConfig(project.projectPath);
    expect(updated.$schema).toBe(customUrl);

    await runCLI(['remove', 'memory', '--name', memName, '--json'], project.projectPath);
  });

  it('does not inject $schema into a pre-existing project that lacks one', async () => {
    const configPath = join(project.projectPath, 'agentcore', 'agentcore.json');
    const config = await readRawConfig(project.projectPath);

    // Simulate an old project by stripping $schema
    delete config.$schema;
    await writeFile(configPath, JSON.stringify(config, null, 2));

    // Trigger a write
    const memName = `OldProj${Date.now().toString().slice(-6)}`;
    await runCLI(['add', 'memory', '--name', memName, '--json'], project.projectPath);

    const updated = await readRawConfig(project.projectPath);
    expect(updated.$schema).toBeUndefined();

    await runCLI(['remove', 'memory', '--name', memName, '--json'], project.projectPath);
  });
});
