import { readFileSync } from 'node:fs';
import { validate } from '@genui/schema';

export interface SeedMessage {
  id: string;
  interactionId: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  data?: Record<string, unknown>;
}
export interface SeedPreview {
  id: string;
  title: string;
  fixtureOnly: true;
  messages: SeedMessage[];
}
export interface SeedCatalog {
  fixtureOnly: true;
  source: { file: string; sha256: string; interpretation: string };
  limitations: string[];
  walkthroughs: { id: string; title: string; messageCount: number }[];
  scenarios: { id: string; title: string; group: string; phase: string; sourceClassification: string }[];
}
interface SeedDataset {
  schemaVersion: '1';
  fixtureOnly: true;
  source: SeedCatalog['source'];
  limitations: string[];
  conversations: SeedPreview[];
  standaloneConversations: SeedPreview[];
  scenarios: { id: string; title: string; group: string; phase: string; sourceClassification: string }[];
}
export function loadConversationSeeds(path = new URL('../../data/conversations/seed-data.json', import.meta.url)) {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const messageSchema = { type: 'object' as const, required: ['id', 'interactionId', 'role', 'text', 'timestamp'], properties: { id: { type: 'string' as const }, interactionId: { type: 'string' as const }, role: { type: 'string' as const, enum: ['user', 'assistant', 'system'] }, text: { type: 'string' as const }, timestamp: { type: 'string' as const, format: 'date-time' }, data: { type: 'object' as const } } };
  const threadSchema = { type: 'object' as const, required: ['id', 'title', 'fixtureOnly', 'messages'], properties: { id: { type: 'string' as const }, title: { type: 'string' as const }, fixtureOnly: { const: true }, messages: { type: 'array' as const, minItems: 1, items: messageSchema } } };
  validate({ type: 'object', required: ['schemaVersion', 'fixtureOnly', 'source', 'limitations', 'scenarios', 'conversations', 'standaloneConversations'], properties: { schemaVersion: { const: '1' }, fixtureOnly: { const: true }, source: { type: 'object', required: ['file', 'sha256', 'interpretation'], properties: { file: { type: 'string' }, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, interpretation: { type: 'string' } } }, limitations: { type: 'array', items: { type: 'string' } }, scenarios: { type: 'array', minItems: 31, maxItems: 31, items: { type: 'object', required: ['id', 'title', 'group', 'phase', 'sourceClassification'], properties: { id: { type: 'string' }, title: { type: 'string' }, group: { type: 'string' }, phase: { type: 'string' }, sourceClassification: { type: 'string' } } } }, conversations: { type: 'array', items: threadSchema }, standaloneConversations: { type: 'array', items: threadSchema } } }, value);
  const dataset = value as SeedDataset;
  const previews = [...dataset.conversations, ...dataset.standaloneConversations];
  if (new Set(previews.map(p => p.id)).size !== previews.length) throw new Error('Duplicate conversation seed IDs');
  return {
    catalog(): SeedCatalog {
      return structuredClone({ fixtureOnly: true, source: dataset.source, limitations: dataset.limitations, walkthroughs: dataset.conversations.map(c => ({ id: c.id, title: c.title, messageCount: c.messages.length })), scenarios: dataset.scenarios.map(s => ({ id: `scenario-${s.id}`, title:s.title, group:s.group, phase:s.phase, sourceClassification:s.sourceClassification })) });
    },
    preview(id: string): SeedPreview | undefined {
      const preview = previews.find(p => p.id === id);
      return preview ? structuredClone(preview) : undefined;
    }
  };
}
