import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testRoot = join(tmpdir(), 'clawx-tests', 'skill-preset-install');
const testHomeDir = join(testRoot, 'home');

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => testHomeDir,
    default: {
      ...actual,
      homedir: () => testHomeDir,
    },
  };
});

describe('installSkillPreset', () => {
  beforeEach(() => {
    vi.resetModules();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('installs market presets from the skills-market bundle', async () => {
    const { installSkillPreset } = await import('@electron/utils/skill-config');
    await installSkillPreset('actionbook', 'web-and-frontend-development');

    const installedSkillPath = join(testHomeDir, '.openclaw', 'skills', 'actionbook', 'SKILL.md');
    const markerPath = join(testHomeDir, '.openclaw', 'skills', 'actionbook', '.openclawpro-preinstalled.json');
    const configPath = join(testHomeDir, '.openclaw', 'openclaw.json');

    expect(existsSync(installedSkillPath)).toBe(true);
    expect(JSON.parse(readFileSync(markerPath, 'utf8'))).toEqual(expect.objectContaining({
      source: 'openclawpro-market-preset',
      slug: 'actionbook',
      version: expect.any(String),
      categoryId: 'web-and-frontend-development',
    }));
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(expect.objectContaining({
      skills: {
        entries: {
          actionbook: { enabled: true },
        },
      },
    }));
  });
});
