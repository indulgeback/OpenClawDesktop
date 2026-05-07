import { describe, expect, it } from 'vitest';
import { getSkillMarketCatalog, loadSkillTemplateDetail } from '@/lib/skill-market';

describe('skill market data', () => {
  it('uses globally unique template ids and controlled categories', () => {
    const catalog = getSkillMarketCatalog();
    const templateIds = catalog.templates.map((template) => template.templateId);
    expect(new Set(templateIds).size).toBe(templateIds.length);

    const categoryIds = new Set(catalog.categories.map((category) => category.id));
    for (const template of catalog.templates) {
      expect(categoryIds.has(template.categoryId)).toBe(true);
    }
  });

  it('loads details with installable files for every template', async () => {
    const catalog = getSkillMarketCatalog();
    for (const template of catalog.templates) {
      const detail = await loadSkillTemplateDetail(template.templateId, template.categoryId);
      expect(detail.templateId).toBe(template.templateId);
      expect(Object.keys(detail.files).length).toBeGreaterThan(0);
      expect(detail.files['SKILL.md']).toBeTypeOf('string');
    }
  });
});
