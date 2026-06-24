import { ConfigReadError, ValidationError } from '../errors';
import { err } from '../result';
import { getJsonDatastore } from './json';
import { inMemorySource } from './source';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const TestSchema = z.object({
  name: z.string(),
  count: z.number().optional(),
  nested: z
    .object({
      items: z.array(z.string()).default([]),
      flag: z.boolean().optional(),
    })
    .optional(),
});

type TestConfig = z.infer<typeof TestSchema>;

function makeStore(initial: TestConfig = { name: 'test', nested: { items: [] } }) {
  return getJsonDatastore({}, { schema: TestSchema, source: inMemorySource(initial), useCache: false });
}

describe('JsonDatastore', () => {
  describe('all', () => {
    it('returns full config', async () => {
      const store = makeStore({ name: 'hello', nested: { items: ['a'] } });
      const result = await store.all();
      const { config } = result.unwrap();
      expect(config).toEqual({ name: 'hello', nested: { items: ['a'] } });
    });

    it('sync variant works', () => {
      const store = makeStore({ name: 'sync' });
      const { config } = store.all({ sync: true }).unwrap();
      expect(config.name).toBe('sync');
    });

    it('returns error for invalid data', async () => {
      const store = getJsonDatastore(
        {},
        { schema: TestSchema, source: inMemorySource({ invalid: true }), useCache: false }
      );
      const result = await store.all();
      expect(() => result.unwrap()).toThrow(ValidationError);
    });

    it('returns ConfigReadError when source read fails', async () => {
      const failingSource = {
        ...inMemorySource({}),
        read: () => Promise.resolve(err(new Error('disk failure'))),
      };
      const store = getJsonDatastore({}, { schema: TestSchema, source: failingSource, useCache: false });
      const result = await store.all();
      expect(() => result.unwrap()).toThrow(ConfigReadError);
    });

    it('returns ConfigReadError when source readSync fails', () => {
      const failingSource = {
        ...inMemorySource({}),
        readSync: () => err(new Error('disk failure')),
      };
      const store = getJsonDatastore({}, { schema: TestSchema, source: failingSource, useCache: false });
      const result = store.all({ sync: true });
      expect(() => result.unwrap()).toThrow(ConfigReadError);
    });
  });

  describe('get', () => {
    it('retrieves top-level value', async () => {
      const store = makeStore({ name: 'foo' });
      const { value } = (await store.get('name')).unwrap();
      expect(value).toBe('foo');
    });

    it('retrieves nested value', async () => {
      const store = makeStore({ name: 'x', nested: { items: ['a', 'b'] } });
      const { value } = (await store.get('nested.items')).unwrap();
      expect(value).toEqual(['a', 'b']);
    });

    it('sync variant works', () => {
      const store = makeStore({ name: 'bar' });
      const { value } = store.get('name', { sync: true }).unwrap();
      expect(value).toBe('bar');
    });
  });

  describe('set', () => {
    it('sets a top-level value', async () => {
      const store = makeStore();
      await store.set('name', 'updated');
      const { value } = (await store.get('name')).unwrap();
      expect(value).toBe('updated');
    });

    it('sets a nested value', async () => {
      const store = makeStore({ name: 'x', nested: { items: [] } });
      await store.set('nested.flag', true);
      const { value } = (await store.get('nested.flag')).unwrap();
      expect(value).toBe(true);
    });

    it('rejects prototype pollution paths', async () => {
      const store = makeStore();
      const result = await store.set('__proto__' as never, 'bad' as never);
      expect(result.success).toBe(false);
    });

    it('rejects invalid values via schema', async () => {
      const store = makeStore();
      const result = await store.set('name', 123 as never);
      expect(result.success).toBe(false);
    });

    it('sync variant works', () => {
      const store = makeStore();
      store.set('name', 'sync-set', { sync: true });
      const { value } = store.get('name', { sync: true }).unwrap();
      expect(value).toBe('sync-set');
    });
  });

  describe('add', () => {
    it('appends item to array', async () => {
      const store = makeStore({ name: 'x', nested: { items: ['a'] } });
      await store.add('nested.items', 'b');
      const { value } = (await store.get('nested.items')).unwrap();
      expect(value).toEqual(['a', 'b']);
    });

    it('does not add duplicate', async () => {
      const store = makeStore({ name: 'x', nested: { items: ['a'] } });
      await store.add('nested.items', 'a');
      const { value } = (await store.get('nested.items')).unwrap();
      expect(value).toEqual(['a']);
    });
  });

  describe('remove', () => {
    it('removes item from array', async () => {
      const store = makeStore({ name: 'x', nested: { items: ['a', 'b'] } });
      await store.remove('nested.items', 'a');
      const { value } = (await store.get('nested.items')).unwrap();
      expect(value).toEqual(['b']);
    });

    it('no-op when item not present', async () => {
      const store = makeStore({ name: 'x', nested: { items: ['a'] } });
      await store.remove('nested.items', 'z');
      const { value } = (await store.get('nested.items')).unwrap();
      expect(value).toEqual(['a']);
    });
  });

  describe('isValidPath', () => {
    it('returns true for valid paths', () => {
      const store = makeStore();
      expect(store.isValidPath('name')).toBe(true);
      expect(store.isValidPath('nested.items')).toBe(true);
    });

    it('returns false for invalid paths', () => {
      const store = makeStore();
      expect(store.isValidPath('nonexistent')).toBe(false);
    });
  });

  describe('isValidPathValue', () => {
    it('returns true for valid value', () => {
      const store = makeStore();
      expect(store.isValidPathValue('name', 'hello')).toBe(true);
    });

    it('returns false for invalid value', () => {
      const store = makeStore();
      expect(store.isValidPathValue('name', 123)).toBe(false);
    });
  });

  describe('caching', () => {
    it('uses cache when enabled', async () => {
      const source = inMemorySource({ name: 'cached' });
      const store = getJsonDatastore({}, { schema: TestSchema, source, useCache: true });

      await store.all();
      // Mutate source directly — cached store shouldn't see it
      await source.write({ name: 'mutated' });
      const { config } = (await store.all()).unwrap();
      expect(config.name).toBe('cached');
    });
  });
});
