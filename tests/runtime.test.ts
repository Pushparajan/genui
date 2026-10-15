import { describe, it, expect, vi } from 'vitest';
import { defineAction } from '@genui/core';
import { InMemoryActionRegistry } from '@genui/registry';
import { GenUIRuntime } from '@genui/runtime';
import { JSONIntentProvider } from '@genui/ai';
import { createTaskApp } from '../examples/task-manager/actions.js';
function setup() { const demo = createTaskApp(); return { ...demo, runtime: new GenUIRuntime(new InMemoryActionRegistry(demo.app.actions), demo.provider) }; }
describe('task workflow', () => {
  it('creates, lists, prefills and updates, then explicitly confirms deletion', async () => {
    const { runtime, context, tasks } = setup();
    const create = await runtime.intent('Create a task', context);
    expect(create.type).toBe('form'); expect(create.action).toBe('tasks.create');
    await runtime.execute(create.action, { title: 'Ship framework', dueDate: '2026-10-20' }, context);
    const id = [...tasks.keys()][0];
    const list = await runtime.intent('Show my tasks', context);
    expect(list.type).toBe('table'); expect(await runtime.execute(list.action, {}, context)).toMatchObject({ status: 'completed', output: [{ id, title: 'Ship framework' }] });
    const update = await runtime.intent('Change the due date', context);
    expect(update.values).toEqual({ id, dueDate: '2026-10-20' });
    await runtime.execute(update.action, { ...update.values, dueDate: '2026-10-21' }, context);
    expect(tasks.get(id)?.dueDate).toBe('2026-10-21');
    const deletion = await runtime.intent('Delete this task', context);
    const result = await runtime.execute(deletion.action, deletion.values!, context);
    expect(tasks.size).toBe(1); expect(result.status).toBe('confirmation');
    if (result.status !== 'confirmation') throw new Error('Expected confirmation');
    await runtime.confirm(result.token, context); expect(tasks.size).toBe(0);
    await expect(runtime.confirm(result.token, context)).rejects.toMatchObject({ code: 'CONFIRMATION' });
  });
  it('rejects invalid dates, missing fields, unknown properties, and unknown actions', async () => {
    const { runtime, context } = setup();
    for (const input of [{}, { title: '' }, { title: 'x', dueDate: '2026-02-30' }, { title: 'x', admin: true }]) await expect(runtime.execute('tasks.create', input, context)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(runtime.execute('missing', {}, context)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('checks authorization at execution and again at confirmation', async () => {
    const { runtime, context } = setup();
    const guest = { services: {} };
    await expect(runtime.execute('tasks.create', { title: 'x' }, guest)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const result = await runtime.execute('tasks.delete', { id: 'test' }, context);
    if (result.status !== 'confirmation') throw new Error('Expected confirmation');
    await expect(runtime.confirm(result.token, { ...context })).rejects.toMatchObject({ code: 'CONFIRMATION' });
    context.user!.roles = [];
    await expect(runtime.confirm(result.token, context)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('expires confirmations', async () => {
    vi.useFakeTimers();
    try {
      const { runtime, context } = setup(); const input = { id: 'one' };
      const result = await runtime.execute('tasks.delete', input, context);
      if (result.status !== 'confirmation') throw new Error('Expected confirmation');
      vi.advanceTimersByTime(300_001);
      await expect(runtime.confirm(result.token, context)).rejects.toMatchObject({ code: 'CONFIRMATION' });
    } finally { vi.useRealTimers(); }
  });
});
it('snapshots confirmation inputs against later caller mutation', async () => {
  const { runtime, context, tasks } = setup();
  await runtime.execute('tasks.create', { title: 'original' }, context);
  const id = [...tasks.keys()][0]; const input = { id };
  const result = await runtime.execute('tasks.delete', input, context);
  input.id = 'changed';
  if (result.status !== 'confirmation') throw new Error('Expected confirmation');
  await runtime.confirm(result.token, context); expect(tasks.size).toBe(0);
});
describe('provider and registry boundaries' , () => {
  it('rejects malformed and hallucinated provider results', async () => {
    for (const value of ['{', { action: 'unknown' }, { action: 'hello', input: [] }]) {
      const provider = new JSONIntentProvider(async () => value);
      await expect(provider.decide({ prompt: 'x', actions: [{ name: 'hello', description: 'hello', input: {} }] })).rejects.toMatchObject({ code: 'PROVIDER' });
    }
  });
  it('accepts a registered provider result', async () => {
    expect(await new JSONIntentProvider(async () => '{"action":"hello","input":{"name":"world"}}').decide({ prompt: 'hello', actions: [{ name: 'hello', description: '', input: {} }] })).toEqual({ action: 'hello', input: { name: 'world' } });
  });
  it('prevents duplicates and runs hooks without bypassing validation', async () => {
    const action = defineAction({ name: 'hello', description: 'Hello', input: { type: 'object', additionalProperties: false }, execute: () => 'world' });
    expect(() => new InMemoryActionRegistry([action, action])).toThrow('duplicate');
    const events: string[] = [];
    const runtime = new GenUIRuntime(new InMemoryActionRegistry([action]), { async decide() { return { action: 'hello' }; } }, { beforeAction: () => { events.push('before'); }, afterAction: () => { events.push('after'); }, onError: () => { events.push('error'); } });
    await runtime.execute('hello', {}, { services: {} }); expect(events).toEqual(['before', 'after']);
    await expect(runtime.execute('hello', { extra: true }, { services: {} })).rejects.toThrow(); expect(events.at(-1)).toBe('error');
  });
});
