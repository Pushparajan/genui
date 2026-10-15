import { defineAction } from '@genui/core';
import { InMemoryActionRegistry } from '@genui/registry';
import { GenUIRuntime } from '@genui/runtime';
const action = defineAction({ name: 'hello', description: 'Say hello', input: { type: 'object', properties: { name: { type: 'string', minLength: 1 } }, required: ['name'], additionalProperties: false }, execute: ({ name }) => ({ greeting: `Hello, ${name}!` }) });
const runtime = new GenUIRuntime(new InMemoryActionRegistry([action]), { async decide() { return { action: 'hello' }; } });
const context = { services: {} };
console.log('Generated UI:', await runtime.intent('Say hello', context));
console.log('Executed action:', await runtime.execute('hello', { name: 'developer' }, context));
