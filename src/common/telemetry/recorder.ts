export interface AttributeRecorder<AttributesShape extends Record<string, unknown>> {
  set<K extends keyof AttributesShape>(attrs: Pick<AttributesShape, K>): void;
  get(): Partial<AttributesShape>;
}

export function createAttributeRecorder<
  AttributesShape extends Record<string, unknown>,
>(): AttributeRecorder<AttributesShape> {
  let recorded: Partial<AttributesShape> = {};

  return {
    set<AttributeKey extends keyof AttributesShape>(attrs: Pick<AttributesShape, AttributeKey>) {
      recorded = { ...recorded, ...attrs };
    },
    get: () => recorded,
  };
}
