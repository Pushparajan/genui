import { GenUIError, type GenUIAIProvider, type IntentDecision, type IntentRequest } from '@genui/core';
/** Provider-neutral bridge. Supply your SDK call on the server; never expose credentials in a browser. */
export class JSONIntentProvider implements GenUIAIProvider {
  constructor(private generate: (request: IntentRequest) => Promise<unknown>) {}
  async decide(request: IntentRequest): Promise<IntentDecision> {
    const raw = await this.generate(request);
    let result: unknown;
    try { result = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new GenUIError('PROVIDER', 'Provider returned invalid JSON'); }
    if (!result || typeof result !== 'object' || !('action' in result) || typeof result.action !== 'string' || !request.actions.some(a => a.name === result.action)) throw new GenUIError('PROVIDER', 'Provider selected an unavailable action');
    const input = 'input' in result ? result.input : undefined;
    if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new GenUIError('PROVIDER', 'Provider input must be an object');
    return { action: result.action, input: input as Record<string, unknown> | undefined };
  }
}
