import { handle } from 'hono/aws-lambda';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { createStore } from './store/index.js';

const config = loadConfig();
const store = createStore();
const app = createApp(store, config);

export const handler = handle(app);
