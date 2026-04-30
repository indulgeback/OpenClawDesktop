export interface AgentSummary {
  id: string;
  name: string;
  isDefault: boolean;
  modelDisplay: string;
  modelRef?: string | null;
  overrideModelRef?: string | null;
  inheritedModel: boolean;
  workspace: string;
  agentDir: string;
  mainSessionKey: string;
  channelTypes: string[];
  templateId?: string;
  sourceRepo?: string;
  sourceCommit?: string;
  sourcePath?: string;
  categoryId?: string;
}

export interface AgentsSnapshot {
  agents: AgentSummary[];
  defaultAgentId: string;
  defaultModelRef?: string | null;
  configuredChannelTypes: string[];
  channelOwners: Record<string, string>;
  channelAccountOwners: Record<string, string>;
}

export interface AgentTemplatePreviewFile {
  fileKey: 'SOUL.md' | 'AGENTS.md' | 'IDENTITY.md';
  description: string;
}

export interface AgentTemplateSummary {
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
  modelRef: string | null;
  previewFiles: AgentTemplatePreviewFile[];
  sourceRepo: string;
  sourceCommit: string;
  sourcePath: string;
  emoji?: string;
  vibe?: string;
}

export interface AgentMarketCategory {
  id: string;
  name: string;
  count: number;
}

export interface AgentMarketCatalog {
  sourceRepo: string;
  sourceCommit: string;
  sourceCommitShort: string;
  generatedAt: string;
  categories: AgentMarketCategory[];
  templates: AgentTemplateSummary[];
}

export interface AgentTemplateDetail extends AgentTemplateSummary {
  files: Record<'SOUL.md' | 'AGENTS.md' | 'IDENTITY.md', string>;
}
