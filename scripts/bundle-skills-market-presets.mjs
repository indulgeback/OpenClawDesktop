#!/usr/bin/env zx

import 'zx/globals';
import { readFileSync, existsSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'resources', 'skills', 'market-manifest.json');
const OUTPUT_ROOT = join(ROOT, 'resources', 'skills-market-presets');
const TMP_ROOT = join(ROOT, 'build', '.tmp-skills-market-presets');
const LOCK_FILE_NAME = '.skills-market-lock.json';

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing manifest: ${MANIFEST_PATH}`);
  }
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.skills) || !Array.isArray(parsed.categories)) {
    throw new Error('Invalid skills-market manifest format');
  }
  for (const item of parsed.skills) {
    if (!item.slug || !item.repo || !item.repoPath || !item.categoryId) {
      throw new Error(`Invalid skills-market manifest entry: ${JSON.stringify(item)}`);
    }
  }
  return parsed;
}

function groupByRepoRef(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const ref = entry.ref || 'main';
    const key = `${entry.repo}#${ref}`;
    if (!grouped.has(key)) grouped.set(key, { repo: entry.repo, ref, entries: [] });
    grouped.get(key).entries.push(entry);
  }
  return [...grouped.values()];
}

function createRepoDirName(repo, ref) {
  return `${repo.replace(/[\\/]/g, '__')}__${ref.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function toGitPath(inputPath) {
  if (process.platform !== 'win32') return inputPath;
  return inputPath.replace(/\\/g, '/');
}

function normalizeRepoPath(repoPath) {
  return repoPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function shouldCopySkillFile(srcPath) {
  const base = basename(srcPath);
  if (base === '.git') return false;
  if (base === '.subset.tar') return false;
  return true;
}

async function extractArchive(archiveFileName, cwd) {
  const prevCwd = $.cwd;
  $.cwd = cwd;
  try {
    try {
      await $`tar -xf ${archiveFileName}`;
      return;
    } catch (tarError) {
      if (process.platform === 'win32') {
        await $`bsdtar -xf ${archiveFileName}`;
        return;
      }
      throw tarError;
    }
  } finally {
    $.cwd = prevCwd;
  }
}

async function fetchSparseRepo(repo, ref, paths, checkoutDir) {
  const remote = `https://github.com/${repo}.git`;
  mkdirSync(checkoutDir, { recursive: true });
  const gitCheckoutDir = toGitPath(checkoutDir);
  const archiveFileName = '.subset.tar';
  const archivePath = join(checkoutDir, archiveFileName);
  const archivePaths = [...new Set(paths.map(normalizeRepoPath))];

  await $`git init ${gitCheckoutDir}`;
  await $`git -C ${gitCheckoutDir} remote add origin ${remote}`;
  await $`git -C ${gitCheckoutDir} fetch --depth 1 origin ${ref}`;
  await $`git -C ${gitCheckoutDir} archive --format=tar --output ${archiveFileName} FETCH_HEAD ${archivePaths}`;
  await extractArchive(archiveFileName, checkoutDir);
  rmSync(archivePath, { force: true });

  return (await $`git -C ${gitCheckoutDir} rev-parse FETCH_HEAD`).stdout.trim();
}

echo`Bundling curated skills market presets...`;

if (process.env.SKIP_PREINSTALLED_SKILLS === '1') {
  echo`⏭  SKIP_PREINSTALLED_SKILLS=1 set, skipping skills market fetch.`;
  process.exit(0);
}

const manifest = loadManifest();
const manifestSkills = manifest.skills;

rmSync(OUTPUT_ROOT, { recursive: true, force: true });
mkdirSync(OUTPUT_ROOT, { recursive: true });
rmSync(TMP_ROOT, { recursive: true, force: true });
mkdirSync(TMP_ROOT, { recursive: true });

const lock = {
  sourceRepo: manifest.sourceRepo,
  sourceRef: manifest.sourceRef || 'main',
  generatedAt: new Date().toISOString(),
  skills: [],
};

const groups = groupByRepoRef(manifestSkills);
for (const group of groups) {
  const repoDir = join(TMP_ROOT, createRepoDirName(group.repo, group.ref));
  const sparsePaths = [...new Set(group.entries.map((entry) => entry.repoPath))];

  echo`Fetching ${group.repo} @ ${group.ref}`;
  const commit = await fetchSparseRepo(group.repo, group.ref, sparsePaths, repoDir);
  echo`   commit ${commit}`;

  for (const entry of group.entries) {
    const sourceDir = join(repoDir, entry.repoPath);
    const targetDir = join(OUTPUT_ROOT, entry.slug);

    if (!existsSync(sourceDir)) {
      throw new Error(`Missing source path in repo checkout: ${entry.repoPath}`);
    }

    rmSync(targetDir, { recursive: true, force: true });
    cpSync(sourceDir, targetDir, { recursive: true, dereference: true, filter: shouldCopySkillFile });

    const skillManifest = join(targetDir, 'SKILL.md');
    if (!existsSync(skillManifest)) {
      throw new Error(`Skill ${entry.slug} is missing SKILL.md after copy`);
    }

    lock.skills.push({
      slug: entry.slug,
      categoryId: entry.categoryId,
      version: commit,
      repo: entry.repo,
      repoPath: entry.repoPath,
      ref: group.ref,
      commit,
      awesomeCategoryPath: entry.awesomeCategoryPath,
    });

    echo`   OK ${entry.slug}`;
  }
}

writeFileSync(join(OUTPUT_ROOT, LOCK_FILE_NAME), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
rmSync(TMP_ROOT, { recursive: true, force: true });
echo`Skills market presets ready: ${OUTPUT_ROOT}`;
