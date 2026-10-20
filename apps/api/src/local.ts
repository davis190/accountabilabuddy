import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { createStore } from './store/index.js';

const config = loadConfig();
const store = createStore();
const app = createApp(store, config);

console.log(`Accountabilabuddy API listening on http://localhost:${config.port}`);
console.log(`Auth mode: ${config.authMode} (memory store)`);

serve({ fetch: app.fetch, port: config.port });
