export type JSONSchema = {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null';
  properties?: Record<string, JSONSchema>; required?: string[]; additionalProperties?: boolean;
  items?: JSONSchema; enum?: (string | number | boolean | null)[]; format?: string;
  title?: string; description?: string; minLength?: number; maxLength?: number;
  minimum?: number; maximum?: number; [keyword: string]: unknown;
};
export interface ExecutionContext {
  user?: { id: string; roles?: string[] };
  services: Record<string, unknown>;
  signal?: AbortSignal;
}
export interface UISchema {
  version: '0.1'; type: 'form' | 'table'; title: string; action: string;
  fields: { name: string; label: string; schema: JSONSchema; required: boolean }[];
  values?: Record<string, unknown>;
}
export interface ActionDefinition<I = Record<string, unknown>, O = unknown> {
  name: string; description: string; input: JSONSchema; outputSchema?: JSONSchema;
  ui?: { type: 'form' | 'table'; title: string };
  confirmation?: boolean;
  authorize?: (context: ExecutionContext) => boolean | Promise<boolean>;
  execute: (input: I, context: ExecutionContext) => O | Promise<O>;
}
// Applications may register actions with heterogeneous input/output types.
export type AnyAction = ActionDefinition<any, any>;
export function defineAction<I = Record<string, unknown>, O = unknown>(action: ActionDefinition<I, O>): ActionDefinition<I, O> { return action; }
export function defineApp<T extends { actions: AnyAction[] }>(app: T): T { return app; }
export interface IntentRequest {
  prompt: string;
  actions: { name: string; description: string; input: JSONSchema }[];
}
export interface IntentDecision { action: string; input?: Record<string, unknown> }
export interface GenUIAIProvider { decide(request: IntentRequest): Promise<IntentDecision> }
export interface RenderContext {
  onSubmit: (input: Record<string, unknown>) => void | Promise<void>;
  data?: unknown; disabled?: boolean;
}
export interface GenUIRenderer<T> { render(schema: UISchema, context: RenderContext): T }
export type InteractionEvent =
  | { type: 'INPUT_CHANGED'; input: Record<string, unknown> }
  | { type: 'ACTION_REQUESTED'; action: string }
  | { type: 'CONFIRMATION_REQUIRED'; action: string }
  | { type: 'ACTION_COMPLETED'; action: string; output: unknown }
  | { type: 'VIEW_UPDATED'; schema: UISchema };
export type HookName = 'beforeDecision' | 'afterDecision' | 'beforeRender' | 'beforeAction' | 'afterAction' | 'onError';
export type LifecycleHooks = Partial<Record<HookName, (value: unknown, context: ExecutionContext) => void | Promise<void>>>;
export class GenUIError extends Error {
  constructor(public code: 'VALIDATION' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFIRMATION' | 'PROVIDER', message: string, public details?: unknown) { super(message); this.name = 'GenUIError'; }
}
