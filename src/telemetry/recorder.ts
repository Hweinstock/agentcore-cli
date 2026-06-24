import type { CommonAttributes } from './shapes';

// this exists in the current CLI. Its use case is for recording dynamic attributes.
export interface AttributeRecorder<AttributesShape extends CommonAttributes> {
  set<K extends keyof AttributesShape>(attrs: Pick<AttributesShape, K>): void;
  get(): Partial<AttributesShape>;
}

export function createAttributeRecorder<
  AttributesShape extends CommonAttributes,
>(): AttributeRecorder<AttributesShape> {
  let recorded: Partial<AttributesShape> = {};

  return {
    set<AttributeKey extends keyof AttributesShape>(attrs: Pick<AttributesShape, AttributeKey>) {
      recorded = { ...recorded, ...attrs };
    },
    get: () => recorded,
  };
}
