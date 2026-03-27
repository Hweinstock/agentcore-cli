import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = join(__dirname, '..', '..', '..', '..', 'schemas', 'agentcore.schema.v1.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

function findDefaultsInRequired(node: unknown, path = ''): string[] {
  const violations: string[] = [];
  if (typeof node !== 'object' || node === null) return violations;
  if (Array.isArray(node)) {
    node.forEach((item, i) => violations.push(...findDefaultsInRequired(item, `${path}[${i}]`)));
    return violations;
  }
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.required) && typeof obj.properties === 'object' && obj.properties !== null) {
    const props = obj.properties as Record<string, Record<string, unknown>>;
    for (const field of obj.required as string[]) {
      if (props[field] && 'default' in props[field]) {
        violations.push(`${path}.${field} has default ${JSON.stringify(props[field].default)} but is in required`);
      }
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    violations.push(...findDefaultsInRequired(value, `${path}.${key}`));
  }
  return violations;
}

describe('generated JSON schema', () => {
  it('no field with a default value appears in any required array', () => {
    const violations = findDefaultsInRequired(schema);
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
