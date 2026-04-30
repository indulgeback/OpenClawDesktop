import { describe, expect, it } from 'vitest';
import { getAgentMarketCatalog, loadAgentTemplateDetail } from '../../src/lib/agent-market';

const expectedCategoryIds = [
  'marketing',
  'product',
  'paid-media',
  'sales',
  'life',
  'social-fun',
  'engineering',
  'specialized',
  'design',
  'finance',
  'project-management',
  'support',
  'testing',
  'game-development',
  'academic',
  'spatial-computing',
];

describe('Agency Agents market data', () => {
  it('keeps template ids globally unique and categories controlled', () => {
    const catalog = getAgentMarketCatalog();
    const ids = new Set(catalog.templates.map((template) => template.templateId));

    expect(catalog.templates).toHaveLength(203);
    expect(catalog.categories.map((category) => category.id)).toEqual(expectedCategoryIds);
    expect(ids.size).toBe(catalog.templates.length);
    expect(catalog.templates.every((template) => expectedCategoryIds.includes(template.categoryId))).toBe(true);
  });

  it('lazy-loads detail records with the three OpenClaw workspace files', async () => {
    const catalog = getAgentMarketCatalog();

    for (const template of catalog.templates) {
      const detail = await loadAgentTemplateDetail(template.templateId, template.categoryId);
      expect(Object.keys(detail.files).sort()).toEqual(['AGENTS.md', 'IDENTITY.md', 'SOUL.md']);
      expect(detail.files['AGENTS.md']).toEqual(expect.any(String));
      expect(detail.files['IDENTITY.md']).toContain(detail.name);
      expect(detail.files['SOUL.md']).toEqual(expect.any(String));
    }
  });
});
