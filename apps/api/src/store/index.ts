import { loadConfig } from '../config.js';
import { MemoryStore } from './memory.js';
import { DynamoDbStore, tablesFromEnv } from './dynamodb.js';
import type { Store } from './types.js';

export function createStore(): Store {
  const config = loadConfig();
  if (config.useMemoryStore) {
    return new MemoryStore();
  }
  return new DynamoDbStore(tablesFromEnv());
}

export type { Store } from './types.js';
export { MemoryStore } from './memory.js';
export { DynamoDbStore } from './dynamodb.js';
