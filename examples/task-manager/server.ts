import { createServer } from 'node:http';
import { GenUIError } from '@genui/core';
import { InMemoryActionRegistry } from '@genui/registry';
import { GenUIRuntime } from '@genui/runtime';
import { createTaskApp } from './actions.js';
const { app, context, provider } = createTaskApp();
const runtime = new GenUIRuntime(new InMemoryActionRegistry(app.actions), provider);
// Single-user local demo. Production hosts must authenticate requests and isolate session state.
createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.method === 'GET' && req.url === '/api/health') { res.end(JSON.stringify({ status: 'ok' })); return; }
    if (req.method !== 'POST' || !['/api/intent', '/api/execute', '/api/confirm'].includes(req.url ?? '')) { res.statusCode = 404; res.end('{}'); return; }
    if (req.headers.origin && !['http://localhost:5173', 'http://127.0.0.1:5173'].includes(req.headers.origin)) { res.statusCode = 403; res.end('{}'); return; }
    let text = '';
    for await (const chunk of req) { text += chunk; if (text.length > 65_536) { res.statusCode = 413; res.end('{}'); return; } }
    const body = JSON.parse(text);
    const result = req.url === '/api/intent' ? await runtime.intent(body.prompt, context) : req.url === '/api/confirm' ? await runtime.confirm(body.token, context) : await runtime.execute(body.action, body.input, context);
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = error instanceof GenUIError && error.code === 'FORBIDDEN' ? 403 : 400;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Request failed', details: error instanceof GenUIError ? error.details : undefined }));
  }
}).listen(3001, '127.0.0.1', () => console.log('GenUI API listening on port 3001'));
