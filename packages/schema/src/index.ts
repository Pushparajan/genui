import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { GenUIError, type AnyAction, type JSONSchema, type UISchema } from '@genui/core';
const ajv = new Ajv({ allErrors: true, strict: true, ownProperties: true });
(addFormats as unknown as (ajv: Ajv) => void)(ajv);
export function validate(schema: JSONSchema, input: unknown): void {
  const check = ajv.compile(schema);
  if (!check(input)) throw new GenUIError('VALIDATION', 'Input does not match the action schema', check.errors);
}
export function compileUI(action: AnyAction, values?: Record<string, unknown>): UISchema {
  return { version: '0.1', type: action.ui?.type ?? 'form', title: action.ui?.title ?? action.description, action: action.name,
    fields: Object.entries(action.input.properties ?? {}).map(([name, schema]) => ({ name, label: schema.title ?? name, schema, required: action.input.required?.includes(name) ?? false })), values };
}

export function assertSchema(schema: JSONSchema): void { ajv.compile(schema); }
