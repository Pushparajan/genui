import { GenUIError, type AnyAction } from '@genui/core';
export interface ActionRegistry { get(name: string): AnyAction; list(): AnyAction[] }
export class InMemoryActionRegistry implements ActionRegistry {
  private actions = new Map<string, AnyAction>();
  constructor(actions: AnyAction[] = []) { for (const action of actions) this.register(action); }
  register(action: AnyAction): void {
    if (!/^[a-zA-Z][\w.-]*$/.test(action.name) || this.actions.has(action.name)) throw new Error(`Invalid or duplicate action: ${action.name}`);
    this.actions.set(action.name, action);
  }
  get(name: string): AnyAction { const action = this.actions.get(name); if (!action) throw new GenUIError('NOT_FOUND', `Unknown action: ${name}`); return action; }
  list(): AnyAction[] { return [...this.actions.values()]; }
}
