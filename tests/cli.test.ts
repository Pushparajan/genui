import { it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
it('scaffolds an app and refuses to overwrite existing content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'genui-cli-'));
  try {
    const cli = resolve('packages/create-genui/bin/create-genui.js');
    const first = spawnSync(process.execPath, [cli, dir], { encoding: 'utf8' });
    expect(first.status, first.stderr).toBe(0);
    const manifest = await readFile(join(dir, 'package.json'), 'utf8');
    expect(JSON.parse(manifest).dependencies['@genui/core']).toBe('0.1.0');
    const second = spawnSync(process.execPath, [cli, dir], { encoding: 'utf8' });
    expect(second.status).toBe(1); expect(second.stderr).toContain('not empty');
    expect(await readFile(join(dir, 'package.json'), 'utf8')).toBe(manifest);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
