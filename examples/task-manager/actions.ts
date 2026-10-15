import { randomUUID } from 'node:crypto';
import { defineAction, defineApp, type ExecutionContext, type GenUIAIProvider } from '@genui/core';
export interface Task { id: string; title: string; dueDate?: string }
export function createTaskApp() {
  const tasks = new Map<string, Task>();
  const context: ExecutionContext = { user: { id: 'demo', roles: ['editor'] }, services: {} };
  const editor = (ctx: ExecutionContext) => ctx.user?.roles?.includes('editor') ?? false;
  const id = { type: 'string' as const, minLength: 1, title: 'Task ID' };
  const date = { type: 'string' as const, format: 'date', title: 'Due date' };
  const app = defineApp({ actions: [
    defineAction<{ title: string; dueDate?: string }, Task>({ name: 'tasks.create', description: 'Create a task', input: { type: 'object', properties: { title: { type: 'string', minLength: 1, title: 'Title' }, dueDate: date }, required: ['title'], additionalProperties: false }, ui: { type: 'form', title: 'Create Task' }, authorize: editor, execute(input) { const task = { ...input, id: randomUUID() }; tasks.set(task.id, task); return task; } }),
    defineAction({ name: 'tasks.list', description: 'Show my tasks', input: { type: 'object', properties: {}, additionalProperties: false }, ui: { type: 'table', title: 'My Tasks' }, execute: () => [...tasks.values()] }),
    defineAction<{ id: string; dueDate: string }, Task>({ name: 'tasks.update', description: 'Change the due date', input: { type: 'object', properties: { id, dueDate: date }, required: ['id', 'dueDate'], additionalProperties: false }, ui: { type: 'form', title: 'Change Due Date' }, authorize: editor, execute(input) { const task = tasks.get(input.id); if (!task) throw new Error('Task not found'); const updated = { ...task, dueDate: input.dueDate }; tasks.set(task.id, updated); return updated; } }),
    defineAction<{ id: string }, { deleted: string }>({ name: 'tasks.delete', description: 'Delete this task', input: { type: 'object', properties: { id }, required: ['id'], additionalProperties: false }, ui: { type: 'form', title: 'Delete Task' }, confirmation: true, authorize: editor, execute({ id }) { if (!tasks.delete(id)) throw new Error('Task not found'); return { deleted: id }; } })
  ] });
  // Credential-free demo matcher uses registered descriptions, never action-specific UI routing.
  const provider: GenUIAIProvider = { async decide({ prompt, actions }) {
    const words: string[] = prompt.toLowerCase().match(/[a-z]+/g) ?? [];
    const ranked = actions.map(action => ({ action, score: (action.description.toLowerCase().match(/[a-z]+/g) ?? []).filter(word => words.includes(word)).length })).sort((a, b) => b.score - a.score);
    if (!ranked[0]?.score) throw new Error('Try one of the example commands.');
    const task = [...tasks.values()].at(-1);
    return { action: ranked[0].action.name, input: task ? Object.fromEntries(Object.entries(task).filter(([key]) => key in (ranked[0].action.input.properties ?? {}))) : {} };
  } };
  return { app, tasks, context, provider };
}
