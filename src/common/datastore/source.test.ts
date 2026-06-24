import { type TempDir, createTempDir } from '../../testing';
import { FileSystemIOError } from '../errors';
import { inMemorySource, jsonFileSource } from './source';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('inMemorySource', () => {
  it('reads initial value', async () => {
    const source = inMemorySource({ key: 'value' });
    const result = await source.read();
    expect(result.unwrap()).toEqual({ key: 'value' });
  });

  it('writes and reads back', async () => {
    const source = inMemorySource({});
    await source.write({ updated: true });
    const result = await source.read();
    expect(result.unwrap()).toEqual({ updated: true });
  });

  it('readSync returns initial value', () => {
    const source = inMemorySource({ x: 1 });
    expect(source.readSync().unwrap()).toEqual({ x: 1 });
  });

  it('writeSync persists value', () => {
    const source = inMemorySource({});
    source.writeSync({ y: 2 });
    expect(source.readSync().unwrap()).toEqual({ y: 2 });
  });

  it('returns cloned data (mutations do not leak)', async () => {
    const source = inMemorySource({ arr: [1] });
    const data = (await source.read()).unwrap() as { arr: number[] };
    data.arr.push(2);
    expect((await source.read()).unwrap()).toEqual({ arr: [1] });
  });
});

describe('jsonFileSource', () => {
  let tmp: TempDir;

  beforeEach(() => {
    tmp = createTempDir();
  });

  afterEach(() => {
    tmp.destroy();
  });

  it('write creates file and read returns content', async () => {
    const source = jsonFileSource(tmp.getPath('data.json'));
    await source.write({ hello: 'world' });
    const result = await source.read();
    expect(result.unwrap()).toEqual({ hello: 'world' });
  });

  it('writeSync creates file and readSync returns content', () => {
    const source = jsonFileSource(tmp.getPath('sync.json'));
    source.writeSync({ sync: true });
    expect(source.readSync().unwrap()).toEqual({ sync: true });
  });

  it('write creates parent directories', async () => {
    const source = jsonFileSource(tmp.getPath('nested/dir/file.json'));
    await source.write({ nested: true });
    expect((await source.read()).unwrap()).toEqual({ nested: true });
  });

  it('write formats JSON with indentation', async () => {
    const filePath = tmp.getPath('pretty.json');
    const source = jsonFileSource(filePath);
    await source.write({ a: 1 });
    const raw = readFileSync(filePath, 'utf-8');
    expect(raw).toBe('{\n  "a": 1\n}');
  });

  it('read returns FileSystemIOError for missing file', async () => {
    const source = jsonFileSource(tmp.getPath('missing.json'));
    const result = await source.read();
    expect(() => result.unwrap()).toThrow(FileSystemIOError);
  });

  it('readSync returns FileSystemIOError for missing file', () => {
    const source = jsonFileSource(tmp.getPath('missing.json'));
    const result = source.readSync();
    expect(() => result.unwrap()).toThrow(FileSystemIOError);
  });
});
