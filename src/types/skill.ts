/**
 * Skill Type Definitions
 * Types for skills/plugins
 */

/**
 * Skill data structure
 */
export interface Skill {
  id: string;
  slug?: string;
  name: string;
  description: string;
  enabled: boolean;
  icon?: string;
  version?: string;
  author?: string;
  configurable?: boolean;
  config?: Record<string, unknown>;
  isCore?: boolean;
  isBundled?: boolean;
  dependencies?: string[];
  source?: string;
  sourceKind?: 'bundled' | 'clawhub' | 'market-preset';
  baseDir?: string;
  filePath?: string;
}

/**
 * Skill bundle (preset skill collection)
 */
export interface SkillBundle {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  icon: string;
  skills: string[];
  recommended?: boolean;
}


/**
 * Marketplace skill data
 */
export interface MarketplaceSkill {
  slug: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  downloads?: number;
  stars?: number;
}

export interface SkillMarketCategory {
  id: string;
  name: string;
  count: number;
}

export interface SkillTemplateSummary {
  id: string;
  templateId: string;
  name: string;
  description: string;
  categoryId: string;
  category: string;
  version: string;
  badge: string;
  status: 'stable';
  tags: string[];
  emoji?: string;
  sourceRepo?: string;
  sourceCommit?: string;
  sourcePath?: string;
  previewFiles: string[];
}

export interface SkillTemplateDetail extends SkillTemplateSummary {
  files: Record<string, string>;
}

export interface SkillMarketCatalog {
  sourceRepo: string;
  sourceCommit: string;
  sourceCommitShort: string;
  generatedAt: string;
  categories: SkillMarketCategory[];
  templates: SkillTemplateSummary[];
}

/**
 * Skill configuration schema
 */
export interface SkillConfigSchema {
  type: 'object';
  properties: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array';
    title?: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
  }>;
  required?: string[];
}
