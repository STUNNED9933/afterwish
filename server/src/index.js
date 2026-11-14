// Cloudflare Worker entry point. The logic lives in app.js so it can be tested in Node.
import { handle, daily } from './app.js';

export default {
  fetch(request, env) {
    return handle(request, env);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(daily(env));
  },
};
