import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { reactRenderer } from '@genui/renderer-react';
import { spectrumRenderer } from '@genui/renderer-spectrum';
import type { UISchema } from '@genui/core';
const schema: UISchema = { version: '0.1', type: 'form', title: 'Create Task', action: 'tasks.create', fields: [{ name: 'title', label: 'Title', required: true, schema: { type: 'string' } }] };
it('renders schema fields with both adapters', () => {
  for (const renderer of [reactRenderer, spectrumRenderer]) { const html = renderToStaticMarkup(renderer.render(schema, { onSubmit() {} })); expect(html).toContain('Create Task'); expect(html).toContain('Title'); expect(html).toContain('required'); }
});
it('escapes untrusted table data', () => { const html = renderToStaticMarkup(reactRenderer.render({ ...schema, type: 'table' }, { onSubmit() {}, data: [{ title: '<script>alert(1)</script>' }] })); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>'); });
