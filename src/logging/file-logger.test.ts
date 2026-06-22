import { retry } from '../common/utils/poll';
import { type TempDir, createTempDir } from '../testing';
import { getFileLogger } from './file-logger';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('getFileLogger', () => {
  let tmp: TempDir;

  beforeEach(() => {
    tmp = createTempDir();
  });

  afterEach(() => {
    tmp.destroy();
  });

  it('writes log entries to the specified file', async () => {
    const filePath = tmp.getPath('output.log');
    const logger = getFileLogger({ filePath, level: 'debug' });

    logger.info('hello world');
    logger.debug('debug message', { key: 'value' });

    const lines = await retry({
      operation: () => (existsSync(filePath) ? readFileSync(filePath, 'utf-8').trim().split('\n') : []),
      condition: l => l.length === 2,
      interval: 10,
      maxAttempts: 50,
    });

    expect(lines).toHaveLength(2);

    const first: unknown = JSON.parse(lines[0]!);
    expect(first).toHaveProperty('msg', 'hello world');
    expect(first).toHaveProperty('level', 30);

    const second: unknown = JSON.parse(lines[1]!);
    expect(second).toHaveProperty('msg', 'debug message');
    expect(second).toHaveProperty('key', 'value');
    expect(second).toHaveProperty('level', 20);
  });

  it('child logger includes prefix in output', async () => {
    const filePath = tmp.getPath('child.log');
    const logger = getFileLogger({ filePath, level: 'info' });
    const child = logger.child({ module: 'myModule' });

    child.info('from child');

    const content = await retry({
      operation: () => (existsSync(filePath) ? readFileSync(filePath, 'utf-8').trim() : ''),
      condition: c => c.length > 0,
      interval: 10,
      maxAttempts: 50,
    });

    const entry: unknown = JSON.parse(content);
    expect(entry).toHaveProperty('msg', 'from child');
    expect(entry).toHaveProperty('module', 'myModule');
  });
});
