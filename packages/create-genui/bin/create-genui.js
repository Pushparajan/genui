#!/usr/bin/env node
import { cp, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const argument = process.argv[2];
if (!argument || argument === '--help') { console.log('Usage: create-genui <directory>'); process.exit(argument ? 0 : 1); }
const target = resolve(argument);
try {
  try { if ((await readdir(target)).length) throw new Error('Destination is not empty'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(target, { recursive: true });
  const template = resolve(dirname(fileURLToPath(import.meta.url)), '../template');
  for (const entry of await readdir(template)) await cp(resolve(template, entry), resolve(target, entry), { recursive: true, force: false, errorOnExist: true });
  console.log(`Created GenUI app in ${target}. Run npm install, then npm run dev. Requires @genui v0.1 packages in your registry (or local tarballs from this monorepo).`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
