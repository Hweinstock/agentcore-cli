export type { Result, ResultWrapped } from './result';
export { ok, err, wrapInResult, unwrapResult } from './result';

export * from './errors';

export { getJsonDatastore, jsonFileSource } from './json-datastore';
export type { JsonDatastore, DataSource as DatastoreSource } from './json-datastore';
