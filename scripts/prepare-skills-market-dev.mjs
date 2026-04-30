#!/usr/bin/env zx

import 'zx/globals';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const lockPath = join(ROOT, 'resources', 'skills-market-presets', '.skills-market-lock.json');
const catalogPath = join(ROOT, 'src', 'data', 'skills-market', 'catalog.json');
const bundleScript = join(ROOT, 'scripts', 'bundle-skills-market-presets.mjs');
const generateScript = join(ROOT, 'scripts', 'generate-skills-market-data.mjs');

if (process.env.CLAWX_SKIP_SKILLS_MARKET_PREPARE === '1') {
  echo`Skipping skills market prepare (CLAWX_SKIP_SKILLS_MARKET_PREPARE=1).`;
  process.exit(0);
}

if (existsSync(lockPath) && existsSync(catalogPath)) {
  echo`Skills market presets already exist, skipping prepare.`;
  process.exit(0);
}

echo`Skills market bundle missing, preparing for dev startup...`;

try {
  await $`zx ${bundleScript}`;
  await $`node ${generateScript}`;
} catch (error) {
  echo`Warning: failed to prepare skills market for dev startup: ${error?.message || error}`;
  process.exit(0);
}
