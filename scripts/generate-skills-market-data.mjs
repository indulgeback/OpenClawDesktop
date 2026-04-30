#!/usr/bin/env node

import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'resources', 'skills', 'market-manifest.json');
const SOURCE_ROOT = join(ROOT, 'resources', 'skills-market-presets');
const LOCK_PATH = join(SOURCE_ROOT, '.skills-market-lock.json');
const OUTPUT_DIR = join(ROOT, 'src', 'data', 'skills-market');
const DETAILS_DIR = join(OUTPUT_DIR, 'details');

const TEXT_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt', '.json', '.jsonl', '.yml', '.yaml', '.toml', '.ini', '.cfg',
  '.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.sh', '.bash', '.zsh',
  '.css', '.scss', '.html', '.xml', '.csv', '.sql',
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function slugToEmoji(slug) {
  if (slug.includes('pdf') || slug.includes('doc')) return '📄';
  if (slug.includes('mail') || slug.includes('calendar')) return '📬';
  if (slug.includes('search') || slug.includes('research')) return '🔎';
  if (slug.includes('fitbit') || slug.includes('health')) return '💪';
  if (slug.includes('browser')) return '🌐';
  if (slug.includes('git') || slug.includes('devops')) return '🛠️';
  if (slug.includes('music') || slug.includes('audio')) return '🎵';
  if (slug.includes('game') || slug.includes('rpg')) return '🎮';
  return '✨';
}

function getAllFiles(dir, baseDir = dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
      continue;
    }
    files.push(fullPath.slice(baseDir.length + 1).replace(/\\/g, '/'));
  }
  return files.sort();
}

function isProbablyText(buffer, filePath) {
  if (buffer.includes(0)) return false;
  const extension = extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8');
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(sample);
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return {};
  try {
    return parseDocument(match[1]).toJS() || {};
  } catch {
    return {};
  }
}

function collectTextFiles(skillDir) {
  const files = {};
  for (const relativePath of getAllFiles(skillDir)) {
    const absolutePath = join(skillDir, relativePath);
    const stats = statSync(absolutePath);
    if (stats.size > 250_000) continue;
    const raw = readFileSync(absolutePath);
    if (!isProbablyText(raw, relativePath)) continue;
    files[relativePath] = raw.toString('utf8');
  }
  return files;
}

function pickPreviewFiles(files) {
  const paths = Object.keys(files);
  const preferred = ['SKILL.md', 'README.md', 'SOUL.md', 'IDENTITY.md', 'AGENTS.md'];
  const picked = [];
  for (const wanted of preferred) {
    if (paths.includes(wanted)) picked.push(wanted);
    if (picked.length === 3) return picked;
  }
  for (const filePath of paths) {
    if (!picked.includes(filePath)) picked.push(filePath);
    if (picked.length === 3) return picked;
  }
  return picked;
}

function compactDescription(frontmatter, files) {
  const description = typeof frontmatter.description === 'string' ? frontmatter.description.trim() : '';
  if (description) {
    return description.replace(/\s+/g, ' ').slice(0, 320);
  }
  const skill = files['SKILL.md'] || '';
  const body = skill.replace(/^---[\s\S]*?---\n?/, '').replace(/\s+/g, ' ').trim();
  return body.slice(0, 320);
}

const manifest = readJson(MANIFEST_PATH);
if (!existsSync(SOURCE_ROOT) || !existsSync(LOCK_PATH)) {
  throw new Error('Skills market presets are missing from resources/skills-market-presets. Run bundle:skills-market to refresh them.');
}

const lock = readJson(LOCK_PATH);
const lockBySlug = new Map((lock.skills || []).map((entry) => [entry.slug, entry]));
const categoryNameById = new Map((manifest.categories || []).map((entry) => [entry.id, entry.name]));

mkdirSync(OUTPUT_DIR, { recursive: true });
rmSync(DETAILS_DIR, { recursive: true, force: true });
mkdirSync(DETAILS_DIR, { recursive: true });

const detailsByCategory = new Map();
const templateSummaries = [];

for (const spec of manifest.skills) {
  const skillDir = join(SOURCE_ROOT, spec.slug);
  if (!existsSync(skillDir)) {
    throw new Error(`Missing bundled market preset: ${spec.slug}`);
  }

  const files = collectTextFiles(skillDir);
  if (!files['SKILL.md']) {
    throw new Error(`Bundled market preset is missing SKILL.md: ${spec.slug}`);
  }

  const frontmatter = parseFrontmatter(files['SKILL.md']);
  const lockEntry = lockBySlug.get(spec.slug) || {};
  const categoryName = categoryNameById.get(spec.categoryId) || spec.categoryId;
  const version = String(lockEntry.version || frontmatter.version || 'bundled');
  const previewFiles = pickPreviewFiles(files);
  const summary = {
    id: spec.slug,
    templateId: spec.slug,
    name: String(frontmatter.name || spec.slug),
    description: compactDescription(frontmatter, files),
    categoryId: spec.categoryId,
    category: categoryName,
    version: version.slice(0, 7),
    badge: 'Curated',
    status: 'stable',
    tags: [],
    emoji: String(frontmatter.metadata?.openclaw?.emoji || frontmatter.emoji || slugToEmoji(spec.slug)),
    sourceRepo: spec.repo,
    sourceCommit: version,
    sourcePath: spec.repoPath,
    previewFiles,
  };

  const detail = {
    ...summary,
    files,
  };

  templateSummaries.push(summary);
  if (!detailsByCategory.has(spec.categoryId)) {
    detailsByCategory.set(spec.categoryId, []);
  }
  detailsByCategory.get(spec.categoryId).push(detail);
}

const categoryCounts = new Map();
for (const template of templateSummaries) {
  categoryCounts.set(template.categoryId, (categoryCounts.get(template.categoryId) || 0) + 1);
}

const catalog = {
  sourceRepo: manifest.sourceRepo,
  sourceCommit: lock.sourceRef || manifest.sourceRef || 'main',
  sourceCommitShort: String(lock.sourceRef || manifest.sourceRef || 'main'),
  generatedAt: lock.generatedAt || new Date().toISOString(),
  categories: manifest.categories
    .filter((category) => categoryCounts.has(category.id))
    .map((category) => ({
      id: category.id,
      name: category.name,
      count: categoryCounts.get(category.id),
    })),
  templates: templateSummaries,
};

writeFileSync(join(OUTPUT_DIR, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

for (const [categoryId, templates] of detailsByCategory) {
  writeFileSync(
    join(DETAILS_DIR, `${categoryId}.json`),
    `${JSON.stringify({ templates }, null, 2)}\n`,
    'utf8',
  );
}

console.log(`Generated skills market catalog with ${templateSummaries.length} templates across ${catalog.categories.length} categories.`);
