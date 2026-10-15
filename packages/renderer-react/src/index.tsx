import { useState, type ReactNode } from 'react';
import type { RenderContext, UISchema } from '@genui/core';
export interface FieldProps { field: UISchema['fields'][number]; value: unknown; onChange: (value: unknown) => void; disabled?: boolean }
export function NativeField({ field, value, onChange, disabled }: FieldProps) {
  const s = field.schema;
  if (s.type === 'object' || s.type === 'array') return <label>{field.label}<textarea disabled={disabled} required={field.required} value={typeof value === 'string' ? value : JSON.stringify(value ?? (s.type === 'array' ? [] : {}))} onChange={e => onChange(e.target.value)} /></label>;
  if (s.enum) return <label>{field.label}<select disabled={disabled} required={field.required} value={String(value ?? '')} onChange={e => onChange(s.enum!.find(x => String(x) === e.target.value))}><option value="">Select…</option>{s.enum.map(x => <option key={String(x)} value={String(x)}>{String(x)}</option>)}</select></label>;
  return <label>{field.label}<input disabled={disabled} required={field.required && s.type !== 'boolean'} type={s.type === 'boolean' ? 'checkbox' : s.type === 'number' || s.type === 'integer' ? 'number' : s.format === 'date' ? 'date' : 'text'} step={s.type === 'integer' ? 1 : 'any'} min={s.minimum} max={s.maximum} minLength={s.minLength} maxLength={s.maxLength} checked={s.type === 'boolean' ? Boolean(value) : undefined} value={s.type === 'boolean' ? undefined : String(value ?? '')} onChange={e => onChange(s.type === 'boolean' ? e.target.checked : (s.type === 'number' || s.type === 'integer') && e.target.value !== '' ? Number(e.target.value) : e.target.value)} /></label>;
}
export function GenUIView({ schema, context, fieldRenderer = props => <NativeField {...props} /> }: { schema: UISchema; context: RenderContext; fieldRenderer?: (props: FieldProps) => ReactNode }) {
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...Object.fromEntries(schema.fields.filter(f => f.required && f.schema.type === 'boolean').map(f => [f.name, false])), ...schema.values }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (schema.type === 'table') {
    const rows: Record<string, unknown>[] = Array.isArray(context.data) ? context.data.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
    const columns = [...new Set(rows.flatMap(row => row && typeof row === 'object' ? Object.keys(row) : []))];
    return <section><h2>{schema.title}</h2><table><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{columns.map(c => <td key={c}>{String(row[c] ?? '')}</td>)}</tr>)}</tbody></table>{!rows.length && <p>No records.</p>}</section>;
  }
  return <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try {
    const input = { ...values };
    for (const f of schema.fields) {
      if (!f.required && (input[f.name] === '' || input[f.name] === undefined)) delete input[f.name];
      else if ((f.schema.type === 'object' || f.schema.type === 'array') && typeof input[f.name] === 'string') input[f.name] = JSON.parse(input[f.name] as string);
    }
    await context.onSubmit(input);
  } catch (err) { setError(err instanceof Error ? err.message : 'Submission failed'); } finally { setBusy(false); } }}><h2>{schema.title}</h2>{schema.fields.map(field => <div key={field.name}>{fieldRenderer({ field, value: values[field.name], disabled: busy || context.disabled, onChange: value => setValues(old => ({ ...old, [field.name]: value })) })}</div>)}<button disabled={busy || context.disabled} type="submit">{busy ? 'Working…' : 'Submit'}</button>{error && <p role="alert">{error}</p>}</form>;
}
export const reactRenderer = { render: (schema: UISchema, context: RenderContext) => <GenUIView key={JSON.stringify(schema)} schema={schema} context={context} /> };
