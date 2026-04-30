import catalogData from '@/data/skills-market/catalog.json';
import type { SkillMarketCatalog, SkillTemplateDetail } from '@/types/skill';

const detailLoaders = import.meta.glob('../data/skills-market/details/*.json');

export function getSkillMarketCatalog(): SkillMarketCatalog {
  return catalogData as SkillMarketCatalog;
}

export async function loadSkillTemplateDetail(
  templateId: string,
  categoryId: string,
): Promise<SkillTemplateDetail> {
  const loader = detailLoaders[`../data/skills-market/details/${categoryId}.json`];
  if (!loader) {
    throw new Error(`Unknown skill template category: ${categoryId}`);
  }

  const module = await loader() as { default: { templates: SkillTemplateDetail[] } };
  const templates = (module.default as { templates: SkillTemplateDetail[] }).templates;
  const detail = templates.find((template) => template.templateId === templateId);
  if (!detail) {
    throw new Error(`Unknown skill template: ${templateId}`);
  }
  return detail;
}
