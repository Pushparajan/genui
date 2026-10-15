import { randomUUID } from 'node:crypto';
import { GenUIError, type ExecutionContext, type GenUIAIProvider, type LifecycleHooks, type InteractionEvent, type UISchema } from '@genui/core';
import { type ActionRegistry } from '@genui/registry';
import { compileUI, validate } from '@genui/schema';
export class GenUIRuntime {
  private pending = new Map<string, { action: string; input: Record<string, unknown>; context: ExecutionContext; expires: number }>();
  constructor(private registry: ActionRegistry, private provider: GenUIAIProvider, private hooks: LifecycleHooks = {}, private emit: (event: InteractionEvent) => void = () => {}) {}
  private async guard(name: string, context: ExecutionContext) {
    context.signal?.throwIfAborted();
    const action = this.registry.get(name);
    // Local actions without a policy are public; applications must declare protected actions explicitly.
    if (action.authorize && !await action.authorize(context)) throw new GenUIError('FORBIDDEN', 'Action is not authorized');
    return action;
  }
  private async attempt<T>(context: ExecutionContext, work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) { await this.hooks.onError?.(error, context); throw error; }
  }
  async intent(prompt: string, context: ExecutionContext): Promise<UISchema> {
    return this.attempt(context, async () => {
      await this.hooks.beforeDecision?.(prompt, context);
      const visible = [];
      for (const action of this.registry.list()) if (!action.authorize || await action.authorize(context)) visible.push({ name: action.name, description: action.description, input: action.input });
      const decision = await this.provider.decide({ prompt, actions: visible });
      await this.hooks.afterDecision?.(decision, context);
      const action = await this.guard(decision.action, context);
      const schema = compileUI(action, decision.input);
      await this.hooks.beforeRender?.(schema, context);
      this.emit({ type: 'VIEW_UPDATED', schema });
      return schema;
    });
  }
  async execute(name: string, input: Record<string, unknown>, context: ExecutionContext): Promise<{ status: 'completed'; output: unknown } | { status: 'confirmation'; token: string }> {
    return this.attempt(context, async () => {
      const action = await this.guard(name, context);
      validate(action.input, input);
      this.emit({ type: 'ACTION_REQUESTED', action: name });
      if (action.confirmation) {
        for (const [token, value] of this.pending) if (value.expires <= Date.now()) this.pending.delete(token);
        const token = randomUUID();
        this.pending.set(token, { action: name, input: structuredClone(input), context, expires: Date.now() + 300_000 });
        this.emit({ type: 'CONFIRMATION_REQUIRED', action: name });
        return { status: 'confirmation', token };
      }
      return { status: 'completed', output: await this.run(name, input, context) };
    });
  }
  async confirm(token: string, context: ExecutionContext): Promise<{ status: 'completed'; output: unknown }> {
    return this.attempt(context, async () => {
      const request = this.pending.get(token);
      if (!request || request.context !== context || request.expires <= Date.now()) throw new GenUIError('CONFIRMATION', 'Confirmation is invalid or expired');
      this.pending.delete(token);
      return { status: 'completed', output: await this.run(request.action, request.input, context) };
    });
  }
  private async run(name: string, input: Record<string, unknown>, context: ExecutionContext) {
    const action = await this.guard(name, context);
    validate(action.input, input);
    await this.hooks.beforeAction?.({ action: name, input }, context);
    context.signal?.throwIfAborted();
    const output = await action.execute(input, context);
    if (action.outputSchema) validate(action.outputSchema, output);
    await this.hooks.afterAction?.({ action: name, output }, context);
    this.emit({ type: 'ACTION_COMPLETED', action: name, output });
    return output;
  }
}
