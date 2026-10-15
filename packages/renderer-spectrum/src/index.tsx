import { Provider, defaultTheme, TextField, NumberField, Checkbox } from '@adobe/react-spectrum';
import { GenUIView, NativeField, type FieldProps } from '@genui/renderer-react';
import type { RenderContext, UISchema } from '@genui/core';
function SpectrumField(props: FieldProps) {
  const { field, value, onChange, disabled } = props;
  if (field.schema.enum || field.schema.type === 'object' || field.schema.type === 'array') return <NativeField {...props} />;
  if (field.schema.type === 'boolean') return <Checkbox isDisabled={disabled} isSelected={Boolean(value)} onChange={onChange}>{field.label}</Checkbox>;
  if (field.schema.type === 'number' || field.schema.type === 'integer') return <NumberField label={field.label} isRequired={field.required} isDisabled={disabled} value={typeof value === 'number' ? value : NaN} minValue={field.schema.minimum} maxValue={field.schema.maximum} step={field.schema.type === 'integer' ? 1 : undefined} onChange={onChange} />;
  return <TextField label={field.label} type={field.schema.format === 'date' ? 'date' : 'text'} isRequired={field.required} isDisabled={disabled} value={String(value ?? '')} onChange={onChange} />;
}
export const spectrumRenderer = { render: (schema: UISchema, context: RenderContext) => <Provider theme={defaultTheme}><GenUIView key={JSON.stringify(schema)} schema={schema} context={context} fieldRenderer={props => <SpectrumField {...props} />} /></Provider> };
