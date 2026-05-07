import catalog from '@/data/agency-agents/catalog.json';
import type { AgentMarketCatalog, AgentTemplateDetail } from '@/types/agent';

type DetailModule = { default: Record<string, AgentTemplateDetail> };

function loadDetails(loader: () => Promise<unknown>): () => Promise<DetailModule> {
  return async () => await loader() as DetailModule;
}

const detailLoaders: Record<string, () => Promise<DetailModule>> = {
  academic: loadDetails(() => import('@/data/agency-agents/details/academic.json')),
  design: loadDetails(() => import('@/data/agency-agents/details/design.json')),
  engineering: loadDetails(() => import('@/data/agency-agents/details/engineering.json')),
  finance: loadDetails(() => import('@/data/agency-agents/details/finance.json')),
  'game-development': loadDetails(() => import('@/data/agency-agents/details/game-development.json')),
  life: loadDetails(() => import('@/data/agency-agents/details/life.json')),
  marketing: loadDetails(() => import('@/data/agency-agents/details/marketing.json')),
  'paid-media': loadDetails(() => import('@/data/agency-agents/details/paid-media.json')),
  product: loadDetails(() => import('@/data/agency-agents/details/product.json')),
  'project-management': loadDetails(() => import('@/data/agency-agents/details/project-management.json')),
  sales: loadDetails(() => import('@/data/agency-agents/details/sales.json')),
  'social-fun': loadDetails(() => import('@/data/agency-agents/details/social-fun.json')),
  'spatial-computing': loadDetails(() => import('@/data/agency-agents/details/spatial-computing.json')),
  specialized: loadDetails(() => import('@/data/agency-agents/details/specialized.json')),
  support: loadDetails(() => import('@/data/agency-agents/details/support.json')),
  testing: loadDetails(() => import('@/data/agency-agents/details/testing.json')),
};

export function getAgentMarketCatalog(): AgentMarketCatalog {
  return catalog as AgentMarketCatalog;
}

export async function loadAgentTemplateDetail(
  templateId: string,
  categoryId: string,
): Promise<AgentTemplateDetail> {
  const loader = detailLoaders[categoryId];
  if (!loader) {
    throw new Error(`Unknown agent template category "${categoryId}"`);
  }

  const details = (await loader()).default;
  const detail = details[templateId];
  if (!detail) {
    throw new Error(`Agent template "${templateId}" was not found`);
  }
  return detail;
}
