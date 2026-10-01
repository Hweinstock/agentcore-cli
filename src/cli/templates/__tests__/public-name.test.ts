import { ConfigIO, serializeResult } from '../../../lib';
import { matchSdkFramework } from '../../../schema';
import type { AddAgentOptions } from '../../commands/add/types.js';
import { validateAddAgentOptions } from '../../commands/add/validate.js';
import { createProjectWithAgent, getDryRunInfo } from '../../commands/create/action.js';
import { registerCreate } from '../../commands/create/command.js';
import type { CreateOptions } from '../../commands/create/types.js';
import { validateCreateOptions } from '../../commands/create/validate.js';
import { AgentPrimitive } from '../../primitives/AgentPrimitive.js';
import type { AddAgentOptions as PrimitiveAddAgentOptions } from '../../primitives/AgentPrimitive.js';
import { Command } from '@commander-js/extra-typings';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

function createCommand() {
  const program = new Command();
  registerCreate(program);
  return program.commands.find(command => command.name() === 'create')!;
}

function addAgentCommand() {
  const add = new Command('add');
  new AgentPrimitive().registerCommands(add, new Command('remove'));
  return add.commands.find(command => command.name() === 'agent')!;
}

describe.each([
  ['create', createCommand],
  ['add agent', addAgentCommand],
] as const)('%s public template selection', (_name, makeCommand) => {
  it('shows --sdk and the public template name in help', () => {
    const help = makeCommand().helpInformation();
    expect(help).toContain('--sdk');
    expect(help).toContain('--framework');
    expect(help).toContain('environment-python-bma');
    expect(help).not.toContain('BedrockManagedAgents');
  });

  it.each(['--sdk', '--framework'])('accepts environment-python-bma via %s', flag => {
    const command = makeCommand();
    expect(command.parseOptions(['--name', 'BmaEnv', flag, 'environment-python-bma']).unknown).toEqual([]);
    expect(command.opts()).toMatchObject({ name: 'BmaEnv', framework: 'environment-python-bma' });
  });
});

describe('headless public template selection', () => {
  let testDir: string;
  const previousSkipInstall = process.env.AGENTCORE_SKIP_INSTALL;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), 'bma-public-name-'));
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    if (previousSkipInstall === undefined) {
      delete process.env.AGENTCORE_SKIP_INSTALL;
    } else {
      process.env.AGENTCORE_SKIP_INSTALL = previousSkipInstall;
    }
  });

  it('creates the BMA dry-run plan from --sdk without model, memory, language, or build flags', () => {
    const command = createCommand();
    command.parseOptions(['--name', 'BmaEnv', '--sdk', 'environment-python-bma']);
    const options = command.opts() as CreateOptions;
    expect(validateCreateOptions(options, testDir)).toEqual({ valid: true });
    const result = getDryRunInfo({ name: options.name!, cwd: testDir, ...options });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(serializeResult(result)).toMatchObject({ sdk: 'environment-python-bma' });
      expect(result.wouldCreate).toContain(join(testDir, 'BmaEnv', 'app', 'BmaEnv', 'lifecycle', 'server.py'));
      expect(result.wouldCreate).not.toContain(join(testDir, 'BmaEnv', 'app', 'BmaEnv', 'main.py'));
    }
  });

  it('adds the BMA template from --sdk with the same defaults and stable profile identity', () => {
    const command = addAgentCommand();
    command.parseOptions(['--name', 'BmaEnv', '--sdk', 'environment-python-bma']);
    const options = command.opts() as AddAgentOptions;
    expect(validateAddAgentOptions(options)).toEqual({ valid: true });
    expect(options).toMatchObject({
      framework: 'BedrockManagedAgents',
      language: 'Python',
      build: 'Container',
      memory: 'none',
      modelProvider: 'Bedrock',
    });
  });

  it('returns the public SDK in create and add result JSON while writing the stable runtime tag', async () => {
    const framework = matchSdkFramework('environment-python-bma')!;
    const created = await createProjectWithAgent({
      name: 'BmaCreated',
      cwd: testDir,
      language: 'Python',
      framework,
      memory: 'none',
      skipGit: true,
      skipInstall: true,
    });
    if (!created.success) throw created.error;
    expect(serializeResult(created)).toMatchObject({ sdk: 'environment-python-bma' });

    const options: PrimitiveAddAgentOptions = {
      name: 'BmaAdded',
      type: 'create',
      buildType: 'Container',
      language: 'Python',
      framework,
      modelProvider: 'Bedrock',
      memory: 'none',
    };
    const added = await new AgentPrimitive().add(options);
    if (!added.success) throw added.error;
    expect(serializeResult(added)).toMatchObject({ sdk: 'environment-python-bma' });

    const project = await new ConfigIO({ baseDir: join(created.projectPath!, 'agentcore') }).readProjectSpec();
    expect(project.runtimes.map(runtime => runtime.tags?.['agentcore:template'])).toEqual([
      'BedrockManagedAgents',
      'BedrockManagedAgents',
    ]);
  });

  it.each([
    ['--build', 'CodeZip', 'supports only --build Container'],
    ['--memory', 'shortTerm', 'supports only --memory none'],
    ['--language', 'TypeScript', 'supports only --language Python'],
    ['--model-provider', 'OpenAI', 'does not support OpenAI'],
    ['--protocol', 'A2A', 'does not support A2A protocol'],
  ])('uses the public SDK in create and add validation errors for %s %s', (flag, value, message) => {
    const create = createCommand();
    create.parseOptions(['--name', 'BmaEnv', '--sdk', 'environment-python-bma', flag, value]);
    expect(validateCreateOptions(create.opts() as CreateOptions, testDir)).toEqual({
      valid: false,
      error: `environment-python-bma ${message}`,
    });
    const add = addAgentCommand();
    add.parseOptions(['--name', 'BmaEnv', '--sdk', 'environment-python-bma', flag, value]);
    expect(validateAddAgentOptions(add.opts() as AddAgentOptions)).toEqual({
      valid: false,
      error: `environment-python-bma ${message}`,
    });
  });

  it('uses the public name when rejecting a legacy BMA import selection', () => {
    expect(
      validateCreateOptions(
        {
          name: 'BmaEnv',
          framework: 'BedrockManagedAgents',
          type: 'import',
          agentId: 'AGENT123',
          agentAliasId: 'ALIAS456',
          region: 'us-east-1',
        },
        testDir
      ).error
    ).toBe('Import only supports Strands or LangChain_LangGraph, got: environment-python-bma');
  });
});
