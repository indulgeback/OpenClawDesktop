/**
 * Skills Page
 * Browse and manage AI skills
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Search,
  Puzzle,
  Lock,
  Package,
  X,
  AlertCircle,
  Plus,
  Key,
  Trash2,
  RefreshCw,
  FolderOpen,
  FileCode,
  Globe,
  Copy,
  Flame,
  Heart,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSkillsStore } from '@/stores/skills';
import { useGatewayStore } from '@/stores/gateway';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import { invokeIpc } from '@/lib/api-client';
import { hostApiFetch } from '@/lib/host-api';
import { trackUiEvent } from '@/lib/telemetry';
import { toast } from 'sonner';
import { getSkillMarketCatalog, loadSkillTemplateDetail } from '@/lib/skill-market';
import type { Skill, SkillMarketCategory, SkillTemplateSummary } from '@/types/skill';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

const INSTALL_ERROR_CODES = new Set(['installTimeoutError', 'installRateLimitError']);
const FETCH_ERROR_CODES = new Set(['fetchTimeoutError', 'fetchRateLimitError', 'timeoutError', 'rateLimitError']);
const SEARCH_ERROR_CODES = new Set(['searchTimeoutError', 'searchRateLimitError', 'timeoutError', 'rateLimitError']);

function getMockSkillMarketMetrics(templateId: string): { heat: number; likes: number } {
  const hash = Array.from(templateId).reduce((accumulator, char) => ((accumulator * 33) ^ char.charCodeAt(0)) >>> 0, 5381);
  return {
    heat: 380 + (hash % 4_200),
    likes: 72 + ((hash >>> 8) % 1_700),
  };
}

function formatSkillMarketMetric(value: number): string {
  if (value >= 1_000) {
    const compact = value / 1_000;
    return `${compact >= 10 ? compact.toFixed(0) : compact.toFixed(1)}k`;
  }
  return String(value);
}



// Skill detail dialog component
interface SkillDetailDialogProps {
  skill: Skill | null;
  isOpen: boolean;
  onClose: () => void;
  onToggle: (enabled: boolean) => void;
  onUninstall?: (slug: string) => void;
  onOpenFolder?: (skill: Skill) => Promise<void> | void;
}

function resolveSkillSourceLabel(skill: Skill, t: TFunction<'skills'>): string {
  if (skill.sourceKind === 'market-preset') return t('source.badge.marketPreset', { defaultValue: 'Built-in Market' });
  if (skill.sourceKind === 'clawhub') return t('source.badge.clawhub', { defaultValue: 'Installed from ClawHub' });
  const source = (skill.source || '').trim().toLowerCase();
  if (!source) {
    if (skill.isBundled) return t('source.badge.bundled', { defaultValue: 'Bundled' });
    return t('source.badge.unknown', { defaultValue: 'Unknown source' });
  }
  if (source === 'openclaw-bundled') return t('source.badge.bundled', { defaultValue: 'Bundled' });
  if (source === 'openclaw-managed') return t('source.badge.managed', { defaultValue: 'Managed' });
  if (source === 'openclaw-workspace') return t('source.badge.workspace', { defaultValue: 'Workspace' });
  if (source === 'openclaw-extra') return t('source.badge.extra', { defaultValue: 'Extra dirs' });
  if (source === 'agents-skills-personal') return t('source.badge.agentsPersonal', { defaultValue: 'Personal .agents' });
  if (source === 'agents-skills-project') return t('source.badge.agentsProject', { defaultValue: 'Project .agents' });
  if (source === 'openclawpro-preinstalled') return t('source.badge.bundled', { defaultValue: 'Bundled' });
  if (source === 'openclawpro-market-preset') return t('source.badge.marketPreset', { defaultValue: 'Built-in Market' });
  return source;
}

function SkillDetailDialog({ skill, isOpen, onClose, onToggle, onUninstall, onOpenFolder }: SkillDetailDialogProps) {
  const { t } = useTranslation('skills');
  const { fetchSkills } = useSkillsStore();
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Initialize config from skill
  useEffect(() => {
    if (!skill) return;

    // API Key
    if (skill.config?.apiKey) {
      setApiKey(String(skill.config.apiKey));
    } else {
      setApiKey('');
    }

    // Env Vars
    if (skill.config?.env) {
      const vars = Object.entries(skill.config.env).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setEnvVars(vars);
    } else {
      setEnvVars([]);
    }
  }, [skill]);

  const handleOpenClawhub = async () => {
    if (!skill?.slug) return;
    await invokeIpc('shell:openExternal', `https://clawhub.ai/s/${skill.slug}`);
  };

  const handleOpenEditor = async () => {
    if (!skill?.id) return;
    try {
      const result = await hostApiFetch<{ success: boolean; error?: string }>('/api/clawhub/open-readme', {
        method: 'POST',
        body: JSON.stringify({ skillKey: skill.id, slug: skill.slug, baseDir: skill.baseDir }),
      });
      if (result.success) {
        toast.success(t('toast.openedEditor'));
      } else {
        toast.error(result.error || t('toast.failedEditor'));
      }
    } catch (err) {
      toast.error(t('toast.failedEditor') + ': ' + String(err));
    }
  };

  const handleCopyPath = async () => {
    if (!skill?.baseDir) return;
    try {
      await navigator.clipboard.writeText(skill.baseDir);
      toast.success(t('toast.copiedPath'));
    } catch (err) {
      toast.error(t('toast.failedCopyPath') + ': ' + String(err));
    }
  };

  const handleAddEnv = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const handleUpdateEnv = (index: number, field: 'key' | 'value', value: string) => {
    const newVars = [...envVars];
    newVars[index] = { ...newVars[index], [field]: value };
    setEnvVars(newVars);
  };

  const handleRemoveEnv = (index: number) => {
    const newVars = [...envVars];
    newVars.splice(index, 1);
    setEnvVars(newVars);
  };

  const handleSaveConfig = async () => {
    if (isSaving || !skill) return;
    setIsSaving(true);
    try {
      // Build env object, filtering out empty keys
      const envObj = envVars.reduce((acc, curr) => {
        const key = curr.key.trim();
        const value = curr.value.trim();
        if (key) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>);

      // Use direct file access instead of Gateway RPC for reliability
      const result = await invokeIpc<{ success: boolean; error?: string }>(
        'skill:updateConfig',
        {
          skillKey: skill.id,
          apiKey: apiKey || '', // Empty string will delete the key
          env: envObj // Empty object will clear all env vars
        }
      ) as { success: boolean; error?: string };

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      // Refresh skills from gateway to get updated config
      await fetchSkills();

      toast.success(t('detail.configSaved'));
    } catch (err) {
      toast.error(t('toast.failedSave') + ': ' + String(err));
    } finally {
      setIsSaving(false);
    }
  };

  if (!skill) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        data-testid="skill-detail-drawer"
        className="w-full sm:max-w-[450px] p-0 flex flex-col border-l border-black/10 dark:border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.2)]"
        side="right"
      >
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-8 py-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 flex items-center justify-center rounded-full bg-white dark:bg-accent border border-black/5 dark:border-white/5 shrink-0 mb-4 relative shadow-sm">
              <span className="text-3xl">{skill.icon || '🔧'}</span>
              {skill.isCore && (
                <div className="absolute -bottom-1 -right-1 bg-card rounded-full p-1 shadow-sm border border-black/5 dark:border-white/5">
                  <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                </div>
              )}
            </div>
            <h2 className="text-[28px] font-serif text-foreground font-normal mb-3 text-center tracking-tight">
              {skill.name}
            </h2>
            <div className="flex items-center justify-center gap-2.5 mb-6 opacity-80">
              <Badge variant="secondary" className="font-mono text-[11px] font-medium px-3 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] border-0 shadow-none text-foreground/70 transition-colors">
                v{skill.version}
              </Badge>
              <Badge variant="secondary" className="font-mono text-[11px] font-medium px-3 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] border-0 shadow-none text-foreground/70 transition-colors">
                {skill.isCore ? t('detail.coreSystem') : skill.isBundled ? t('detail.bundled') : t('detail.userInstalled')}
              </Badge>
            </div>

            {skill.description && (
              <p className="text-[14px] text-foreground/70 font-medium leading-[1.6] text-center px-4">
                {skill.description}
              </p>
            )}
          </div>

          <div className="space-y-7 px-1">
            <div className="space-y-2">
              <h3 className="text-[13px] font-bold text-foreground/80">{t('detail.source')}</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="font-mono text-[11px] font-medium px-3 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.08] border-0 shadow-none text-foreground/70">
                  {resolveSkillSourceLabel(skill, t)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={skill.baseDir || t('detail.pathUnavailable')}
                  readOnly
                  className="app-field h-[38px] rounded-xl font-mono text-[12px] text-foreground/70 shadow-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-[38px] w-[38px] border-black/10 dark:border-white/10"
                  disabled={!skill.baseDir}
                  onClick={handleCopyPath}
                  title={t('detail.copyPath')}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-[38px] w-[38px] border-black/10 dark:border-white/10"
                  disabled={!skill.baseDir}
                  onClick={() => onOpenFolder?.(skill)}
                  title={t('detail.openActualFolder')}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* API Key Section */}
            {!skill.isCore && (
              <div className="space-y-2">
                <h3 className="text-[13px] font-bold flex items-center gap-2 text-foreground/80">
                  <Key className="h-3.5 w-3.5 text-blue-500" />
                  {t('detail.apiKey')}
                </h3>
                <Input
                  placeholder={t('detail.apiKeyPlaceholder', 'Enter API Key (optional)')}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  type="password"
                  className="app-field h-[44px] rounded-xl font-mono text-[13px] shadow-sm"
                />
                <p className="text-[12px] text-foreground/50 mt-2 font-medium">
                  {t('detail.apiKeyDesc', 'The primary API key for this skill. Leave blank if not required or configured elsewhere.')}
                </p>
              </div>
            )}

            {/* Environment Variables Section */}
            {!skill.isCore && (
              <div className="space-y-3">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13px] font-bold text-foreground/80">
                      {t('detail.envVars')}
                      {envVars.length > 0 && (
                        <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px] h-5 bg-black/10 dark:bg-white/10 text-foreground">
                          {envVars.length}
                        </Badge>
                      )}
                    </h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[12px] font-semibold text-foreground/80 gap-1.5 px-2.5 hover:bg-black/5 dark:hover:bg-white/5"
                    onClick={handleAddEnv}
                  >
                    <Plus className="h-3 w-3" strokeWidth={3} />
                    {t('detail.addVariable', 'Add Variable')}
                  </Button>
                </div>

                <div className="space-y-2">
                  {envVars.length === 0 && (
                    <div className="app-subtle-surface flex items-center px-4 py-3 text-[13px] font-medium italic text-foreground/50">
                      {t('detail.noEnvVars', 'No environment variables configured.')}
                    </div>
                  )}

                  {envVars.map((env, index) => (
                    <div className="flex items-center gap-3" key={index}>
                      <Input
                        value={env.key}
                        onChange={(e) => handleUpdateEnv(index, 'key', e.target.value)}
                        className="app-field flex-1 h-[40px] rounded-xl font-mono text-[13px] shadow-sm"
                        placeholder={t('detail.keyPlaceholder', 'Key')}
                      />
                      <Input
                        value={env.value}
                        onChange={(e) => handleUpdateEnv(index, 'value', e.target.value)}
                        className="app-field flex-1 h-[40px] rounded-xl font-mono text-[13px] shadow-sm"
                        placeholder={t('detail.valuePlaceholder', 'Value')}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-destructive/70 hover:text-destructive hover:bg-destructive/10 shrink-0 rounded-xl transition-colors"
                        onClick={() => handleRemoveEnv(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* External Links */}
            {skill.slug && !skill.isBundled && !skill.isCore && (
              <div className="flex gap-2 justify-center pt-8">
                <Button variant="outline" size="sm" className="h-[28px] text-[11px] font-medium px-3 gap-1.5 rounded-full border-black/10 dark:border-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 shadow-none text-foreground/70" onClick={handleOpenClawhub}>
                  <Globe className="h-[12px] w-[12px]" />
                  ClawHub
                </Button>
                <Button variant="outline" size="sm" className="h-[28px] text-[11px] font-medium px-3 gap-1.5 rounded-full border-black/10 dark:border-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 shadow-none text-foreground/70" onClick={handleOpenEditor}>
                  <FileCode className="h-[12px] w-[12px]" />
                  {t('detail.openManual')}
                </Button>
              </div>
            )}
          </div>

          {/* Centered Footer Buttons */}
          <div className="pt-8 pb-4 flex items-center justify-center gap-4 w-full px-2 max-w-[340px] mx-auto">
            {!skill.isCore && (
              <Button
                onClick={handleSaveConfig}
                className={cn(
                  "flex-1 h-[42px] rounded-full border border-transparent text-[13px] font-semibold shadow-sm transition-all"
                )}
                disabled={isSaving}
              >
                {isSaving ? t('detail.saving') : t('detail.saveConfig')}
              </Button>
            )}

            {!skill.isCore && (
              <Button
                variant="outline"
                className="flex-1 h-[42px] text-[13px] rounded-full font-semibold shadow-sm bg-transparent border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-foreground/80 hover:text-foreground"
                onClick={() => {
                  if (!skill.isBundled && onUninstall && skill.slug) {
                    onUninstall(skill.slug);
                    onClose();
                  } else {
                    onToggle(!skill.enabled);
                  }
                }}
              >
                {!skill.isBundled && onUninstall
                  ? t('detail.uninstall')
                  : (skill.enabled ? t('detail.disable') : t('detail.enable'))}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type SkillManageSourceFilter = 'all' | 'bundled' | 'clawhub' | 'market-preset';

function inferSkillMatchesTemplate(skill: Skill, templateId: string): boolean {
  return skill.id === templateId || skill.slug === templateId;
}

export function Skills() {
  const {
    skills,
    loading,
    error,
    fetchSkills,
    enableSkill,
    disableSkill,
    searchResults,
    searchSkills,
    installSkill,
    installPresetSkill,
    uninstallSkill,
    searching,
    searchError,
    installing,
  } = useSkillsStore();
  const { t } = useTranslation('skills');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const marketCatalog = useMemo(() => getSkillMarketCatalog(), []);
  const templatesByCategory = useMemo(() => {
    const grouped = new Map<string, SkillTemplateSummary[]>();
    for (const template of marketCatalog.templates) {
      const list = grouped.get(template.categoryId) ?? [];
      list.push(template);
      grouped.set(template.categoryId, list);
    }
    return grouped;
  }, [marketCatalog.templates]);

  const [scene, setScene] = useState<'market' | 'manage'>('market');
  const [activeCategoryId, setActiveCategoryId] = useState(marketCatalog.categories[0]?.id ?? '');
  const categoryScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollCategoriesLeft, setCanScrollCategoriesLeft] = useState(false);
  const [canScrollCategoriesRight, setCanScrollCategoriesRight] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [installQuery, setInstallQuery] = useState('');
  const [installSheetOpen, setInstallSheetOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedSource, setSelectedSource] = useState<SkillManageSourceFilter>('all');

  const isGatewayRunning = gatewayStatus.state === 'running';
  const [showGatewayWarning, setShowGatewayWarning] = useState(false);
  const [skillsDirPath, setSkillsDirPath] = useState('~/.openclaw/skills');

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (!isGatewayRunning) {
      timer = setTimeout(() => {
        setShowGatewayWarning(true);
      }, 1500);
    } else {
      timer = setTimeout(() => {
        setShowGatewayWarning(false);
      }, 0);
    }
    return () => clearTimeout(timer);
  }, [isGatewayRunning]);

  useEffect(() => {
    if (isGatewayRunning) {
      void fetchSkills();
    }
  }, [fetchSkills, isGatewayRunning]);

  useEffect(() => {
    invokeIpc<string>('openclaw:getSkillsDir')
      .then((dir) => setSkillsDirPath(dir as string))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!installSheetOpen) return;
    const query = installQuery.trim();
    if (query.length === 0) {
      void searchSkills('');
      return;
    }
    const timer = setTimeout(() => {
      void searchSkills(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [installQuery, installSheetOpen, searchSkills]);

  const safeSkills = Array.isArray(skills) ? skills : [];
  const installedTemplates = useMemo(() => {
    const map = new Map<string, Skill>();
    for (const skill of safeSkills) {
      for (const template of marketCatalog.templates) {
        if (inferSkillMatchesTemplate(skill, template.templateId)) {
          map.set(template.templateId, skill);
        }
      }
    }
    return map;
  }, [marketCatalog.templates, safeSkills]);

  const filteredSkills = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return safeSkills.filter((skill) => {
      const matchesSearch =
        q.length === 0 ||
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.id.toLowerCase().includes(q) ||
        (skill.slug || '').toLowerCase().includes(q) ||
        (skill.author || '').toLowerCase().includes(q);

      let matchesSource = true;
      if (selectedSource === 'bundled') {
        matchesSource = skill.sourceKind === 'bundled' || !!skill.isBundled;
      } else if (selectedSource === 'clawhub') {
        matchesSource = skill.sourceKind === 'clawhub';
      } else if (selectedSource === 'market-preset') {
        matchesSource = skill.sourceKind === 'market-preset';
      }

      return matchesSearch && matchesSource;
    }).sort((a, b) => {
      if (a.enabled && !b.enabled) return -1;
      if (!a.enabled && b.enabled) return 1;
      if (a.isCore && !b.isCore) return -1;
      if (!a.isCore && b.isCore) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [safeSkills, searchQuery, selectedSource]);

  const sourceStats = useMemo(() => ({
    all: safeSkills.length,
    bundled: safeSkills.filter((skill) => skill.sourceKind === 'bundled' || !!skill.isBundled).length,
    clawhub: safeSkills.filter((skill) => skill.sourceKind === 'clawhub').length,
    marketPreset: safeSkills.filter((skill) => skill.sourceKind === 'market-preset').length,
  }), [safeSkills]);

  const bulkToggleVisible = useCallback(async (enable: boolean) => {
    const candidates = filteredSkills.filter((skill) => !skill.isCore && skill.enabled !== enable);
    if (candidates.length === 0) {
      toast.info(enable ? t('toast.noBatchEnableTargets') : t('toast.noBatchDisableTargets'));
      return;
    }

    let succeeded = 0;
    for (const skill of candidates) {
      try {
        if (enable) {
          await enableSkill(skill.id);
        } else {
          await disableSkill(skill.id);
        }
        succeeded += 1;
      } catch {
        // Continue through the visible filtered list and summarize at the end.
      }
    }

    trackUiEvent('skills.batch_toggle', { enable, total: candidates.length, succeeded });
    if (succeeded === candidates.length) {
      toast.success(enable ? t('toast.batchEnabled', { count: succeeded }) : t('toast.batchDisabled', { count: succeeded }));
      return;
    }
    toast.warning(t('toast.batchPartial', { success: succeeded, total: candidates.length }));
  }, [disableSkill, enableSkill, filteredSkills, t]);

  const handleToggle = useCallback(async (skillId: string, enable: boolean) => {
    try {
      if (enable) {
        await enableSkill(skillId);
        toast.success(t('toast.enabled'));
      } else {
        await disableSkill(skillId);
        toast.success(t('toast.disabled'));
      }
    } catch (err) {
      toast.error(String(err));
    }
  }, [enableSkill, disableSkill, t]);

  const handleOpenSkillsFolder = useCallback(async () => {
    try {
      const skillsDir = await invokeIpc<string>('openclaw:getSkillsDir');
      if (!skillsDir) {
        throw new Error('Skills directory not available');
      }
      const result = await invokeIpc<string>('shell:openPath', skillsDir);
      if (result) {
        if (result.toLowerCase().includes('no such file') || result.toLowerCase().includes('not found') || result.toLowerCase().includes('failed to open')) {
          toast.error(t('toast.failedFolderNotFound'));
        } else {
          throw new Error(result);
        }
      }
    } catch (err) {
      toast.error(t('toast.failedOpenFolder') + ': ' + String(err));
    }
  }, [t]);

  const handleOpenSkillFolder = useCallback(async (skill: Skill) => {
    try {
      const result = await hostApiFetch<{ success: boolean; error?: string }>('/api/clawhub/open-path', {
        method: 'POST',
        body: JSON.stringify({
          skillKey: skill.id,
          slug: skill.slug,
          baseDir: skill.baseDir,
        }),
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to open folder');
      }
    } catch (err) {
      toast.error(t('toast.failedOpenActualFolder') + ': ' + String(err));
    }
  }, [t]);

  const handleInstall = useCallback(async (slug: string) => {
    try {
      await installSkill(slug);
      await enableSkill(slug);
      toast.success(t('toast.installed'));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (INSTALL_ERROR_CODES.has(errorMessage)) {
        toast.error(t(`toast.${errorMessage}`, { path: skillsDirPath }), { duration: 10000 });
      } else {
        toast.error(t('toast.failedInstall') + ': ' + errorMessage);
      }
    }
  }, [enableSkill, installSkill, skillsDirPath, t]);

  const handleInstallPreset = useCallback(async (template: SkillTemplateSummary) => {
    try {
      const detail = await loadSkillTemplateDetail(template.templateId, template.categoryId);
      await installPresetSkill(detail.templateId, detail.categoryId);
      toast.success(t('toast.presetInstalled', { name: detail.name }));
    } catch (err) {
      toast.error(t('toast.failedInstall') + ': ' + String(err));
    }
  }, [installPresetSkill, t]);

  const handleUninstall = useCallback(async (slug: string) => {
    try {
      await uninstallSkill(slug);
      toast.success(t('toast.uninstalled'));
    } catch (err) {
      toast.error(t('toast.failedUninstall') + ': ' + String(err));
    }
  }, [uninstallSkill, t]);

  const handleManageTemplate = useCallback((template: SkillTemplateSummary) => {
    const installedSkill = installedTemplates.get(template.templateId);
    setScene('manage');
    if (installedSkill) {
      setSelectedSkill(installedSkill);
    }
  }, [installedTemplates]);

  const activeCategory = marketCatalog.categories.find((category) => category.id === activeCategoryId) ?? marketCatalog.categories[0];

  const updateCategoryScrollState = useCallback(() => {
    const node = categoryScrollRef.current;
    if (!node) {
      setCanScrollCategoriesLeft(false);
      setCanScrollCategoriesRight(false);
      return;
    }

    const maxScrollLeft = Math.max(node.scrollWidth - node.clientWidth, 0);
    setCanScrollCategoriesLeft(node.scrollLeft > 4);
    setCanScrollCategoriesRight(node.scrollLeft < maxScrollLeft - 4);
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(updateCategoryScrollState);
    const handleResize = () => updateCategoryScrollState();
    window.addEventListener('resize', handleResize);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [marketCatalog.categories, updateCategoryScrollState]);

  const scrollCategoriesBy = useCallback((direction: 'left' | 'right') => {
    const node = categoryScrollRef.current;
    if (!node) return;
    const delta = Math.max(node.clientWidth * 0.6, 160);
    node.scrollBy({
      left: direction === 'left' ? -delta : delta,
      behavior: 'smooth',
    });
  }, []);

  return (
    <div className="flex flex-col -m-6 dark:bg-background h-[calc(100vh-2.5rem)] overflow-hidden" data-testid="skills-page">
      <div className="w-full max-w-6xl mx-auto flex flex-col h-full p-8 md:p-10 pt-12 md:pt-16">
        <div className="flex flex-col gap-6 shrink-0">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <h1 className="text-4xl font-normal tracking-tight text-foreground md:text-5xl" style={{ fontFamily: 'Georgia, Cambria, \"Times New Roman\", Times, serif' }}>
                {t('title')}
              </h1>
              <p className="max-w-3xl text-[15px] font-medium leading-6 text-foreground/65 md:text-[16px]">
                {t('subtitle')}
              </p>
            </div>

            <div className="inline-flex w-fit items-center rounded-full border border-black/10 bg-black/[0.03] p-1 dark:border-white/10 dark:bg-white/[0.04]">
              <button
                data-testid="skills-scene-market"
                aria-pressed={scene === 'market'}
                onClick={() => setScene('market')}
                className={cn(
                  'rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors',
                  scene === 'market' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('scene.market')}
              </button>
              <button
                data-testid="skills-scene-manage"
                aria-pressed={scene === 'manage'}
                onClick={() => setScene('manage')}
                className={cn(
                  'rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors',
                  scene === 'manage' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('scene.manage')}
              </button>
            </div>
          </div>

          {scene === 'manage' && showGatewayWarning && (
            <div className="rounded-xl border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm font-medium text-yellow-700 dark:text-yellow-400">
              {t('gatewayWarning')}
            </div>
          )}
        </div>

        <div className="mt-6 min-h-0 flex-1 overflow-hidden">
          {scene === 'market' ? (
            <div className="flex h-full flex-col gap-6 overflow-hidden" data-testid="skills-market">
              <div className="flex shrink-0 items-center gap-2">
                <nav
                  ref={categoryScrollRef}
                  className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  aria-label={t('market.catalog')}
                  onScroll={updateCategoryScrollState}
                  style={{ msOverflowStyle: 'none' }}
                >
                  {marketCatalog.categories.map((category: SkillMarketCategory) => (
                    <button
                      key={category.id}
                      type="button"
                      data-testid={`skills-category-${category.id}`}
                      onClick={() => setActiveCategoryId(category.id)}
                      className={cn(
                        'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
                        activeCategory?.id === category.id
                          ? 'border-foreground/15 bg-foreground text-background'
                          : 'border-black/10 bg-transparent text-muted-foreground hover:text-foreground dark:border-white/10',
                      )}
                    >
                      {t(`categories.${category.id}`, { defaultValue: category.name })} ({category.count})
                    </button>
                  ))}
                </nav>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    data-testid="skills-categories-scroll-left"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => scrollCategoriesBy('left')}
                    disabled={!canScrollCategoriesLeft}
                    aria-label={t('common:actions.previous')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    data-testid="skills-categories-scroll-right"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => scrollCategoriesBy('right')}
                    disabled={!canScrollCategoriesRight}
                    aria-label={t('common:actions.next')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-2" data-testid={`skills-market-section-${activeCategory?.id ?? 'none'}`}>
                {marketCatalog.categories
                  .filter((category) => !activeCategory || category.id === activeCategory.id)
                  .map((category) => {
                    const templates = templatesByCategory.get(category.id) ?? [];
                    return (
                      <section key={category.id} className="space-y-5 pb-8">
                        <div className="space-y-1">
                          <h2 className="text-2xl font-normal tracking-tight text-foreground" style={{ fontFamily: 'Georgia, Cambria, \"Times New Roman\", Times, serif' }}>
                            {t(`categories.${category.id}`, { defaultValue: category.name })}
                          </h2>
                          <p className="text-sm text-muted-foreground">
                            {t('market.categoryCount', { count: category.count })}
                          </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {templates.map((template) => {
                            const installedSkill = installedTemplates.get(template.templateId);
                            const isInstalling = !!installing[template.templateId];
                            const metrics = getMockSkillMarketMetrics(template.templateId);
                            return (
                              <article
                                key={template.templateId}
                                data-testid={`skill-template-${template.templateId}`}
                                className="group flex min-h-[176px] flex-col rounded-2xl border border-border/70 bg-card/70 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors duration-200 hover:border-foreground/12 hover:bg-card hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:hover:shadow-none"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/70 text-lg">
                                    {template.emoji || '🧩'}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{template.name}</h3>
                                    <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-[1.45] text-muted-foreground">{template.description}</p>
                                  </div>
                                </div>

                                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                                  <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-muted-foreground">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-1 leading-none">
                                      <Flame className="h-3.5 w-3.5 text-foreground/45" />
                                      {formatSkillMarketMetric(metrics.heat)}
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-1 leading-none">
                                      <Heart className="h-3.5 w-3.5 text-foreground/45" />
                                      {formatSkillMarketMetric(metrics.likes)}
                                    </span>
                                  </div>
                                  <div className="flex shrink-0 items-center justify-end gap-2">
                                    {installedSkill ? (
                                      <Button
                                        variant="outline"
                                        data-testid={`skill-template-manage-${template.templateId}`}
                                        className="h-7 rounded-full px-2.5 text-[12px]"
                                        onClick={() => handleManageTemplate(template)}
                                      >
                                        {t('market.manage')}
                                      </Button>
                                    ) : (
                                      <Button
                                        data-testid={`skill-template-add-${template.templateId}`}
                                        className="h-7 rounded-full px-2.5 text-[12px]"
                                        onClick={() => void handleInstallPreset(template)}
                                        disabled={isInstalling}
                                      >
                                        {isInstalling ? (
                                          <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                                        )}
                                        {t('market.add')}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col gap-4" data-testid="skills-manage">
              <div className="flex flex-col gap-3 border-b border-black/10 pb-4 dark:border-white/10">
                <div
                  data-testid="skills-manage-actions-row"
                  className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="relative flex min-w-0 items-center rounded-full border border-black/10 bg-black/[0.03] px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.04] md:w-[260px]">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                      placeholder={t('search')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="ml-2 min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-foreground/50"
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => setSearchQuery('')} className="ml-1 shrink-0 text-foreground/50 hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void bulkToggleVisible(true)}
                      className="h-8 rounded-full border-black/10 bg-transparent px-3 text-[12px] shadow-none dark:border-white/10"
                    >
                      {t('actions.enableVisible')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void bulkToggleVisible(false)}
                      className="h-8 rounded-full border-black/10 bg-transparent px-3 text-[12px] shadow-none dark:border-white/10"
                    >
                      {t('actions.disableVisible')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenSkillsFolder}
                      className="h-8 rounded-full border-black/10 bg-transparent px-3 text-[12px] shadow-none dark:border-white/10"
                    >
                      <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                      {t('openFolder')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setInstallQuery('');
                        setInstallSheetOpen(true);
                      }}
                      data-testid="skills-open-install-drawer"
                      className="h-8 rounded-full border-black/10 bg-transparent px-3 text-[12px] shadow-none dark:border-white/10"
                    >
                      {t('actions.installSkill')}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => void fetchSkills()}
                      disabled={!isGatewayRunning}
                      className="h-8 w-8 rounded-full border-black/10 bg-transparent shadow-none dark:border-white/10"
                      title={t('refresh')}
                    >
                      <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                    </Button>
                  </div>
                </div>

                <div
                  data-testid="skills-manage-category-row"
                  className="flex items-center gap-2 overflow-x-auto pb-1 text-[13px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={{ msOverflowStyle: 'none' }}
                >
                  <button
                    onClick={() => setSelectedSource('all')}
                    className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors', selectedSource === 'all' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/5 text-muted-foreground hover:text-foreground dark:bg-white/5')}
                  >
                    {t('filter.all', { count: sourceStats.all })}
                  </button>
                  <button
                    onClick={() => setSelectedSource('bundled')}
                    className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors', selectedSource === 'bundled' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/5 text-muted-foreground hover:text-foreground dark:bg-white/5')}
                  >
                    {t('filter.bundled', { count: sourceStats.bundled })}
                  </button>
                  <button
                    onClick={() => setSelectedSource('market-preset')}
                    className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors', selectedSource === 'market-preset' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/5 text-muted-foreground hover:text-foreground dark:bg-white/5')}
                  >
                    {t('filter.builtInMarket', { count: sourceStats.marketPreset })}
                  </button>
                  <button
                    onClick={() => setSelectedSource('clawhub')}
                    className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors', selectedSource === 'clawhub' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/5 text-muted-foreground hover:text-foreground dark:bg-white/5')}
                  >
                    {t('filter.clawhub', { count: sourceStats.clawhub })}
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                {error && (
                  <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm font-medium text-destructive">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>
                      {FETCH_ERROR_CODES.has(error)
                        ? t(`toast.${error}`, { path: skillsDirPath })
                        : error}
                    </span>
                  </div>
                )}

                {loading && safeSkills.length === 0 ? (
                  <div className="flex items-center justify-center py-20">
                    <LoadingSpinner size="lg" />
                  </div>
                ) : filteredSkills.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Puzzle className="mb-4 h-10 w-10 opacity-50" />
                    <p>{searchQuery ? t('noSkillsSearch') : t('noSkillsAvailable')}</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {filteredSkills.map((skill) => (
                      <div
                        key={skill.id}
                        data-testid={`skill-card-${skill.id}`}
                        className="group flex cursor-pointer flex-row items-center justify-between rounded-xl border-b border-black/5 px-3 py-3.5 transition-colors hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5"
                        onClick={() => setSelectedSkill(skill)}
                      >
                        <div className="flex flex-1 items-start gap-4 overflow-hidden pr-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/5 bg-black/5 text-2xl dark:border-white/10 dark:bg-white/5">
                            {skill.icon || '🧩'}
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <div className="mb-1 flex items-center gap-2">
                              <h3 className="truncate text-[15px] font-semibold text-foreground">{skill.name}</h3>
                              {skill.isCore ? (
                                <Lock className="h-3 w-3 text-muted-foreground" />
                              ) : skill.isBundled ? (
                                <Puzzle className="h-3 w-3 text-blue-500/70" />
                              ) : null}
                              {skill.slug && skill.slug !== skill.name ? (
                                <span className="rounded border border-black/10 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground dark:border-white/10">
                                  {skill.slug}
                                </span>
                              ) : null}
                            </div>
                            <p className="line-clamp-1 pr-6 text-[13.5px] leading-relaxed text-muted-foreground">
                              {skill.description}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-foreground/55">
                              <Badge variant="secondary" className="h-5 border-0 bg-black/5 px-1.5 py-0 text-[10px] font-medium shadow-none dark:bg-white/10">
                                {resolveSkillSourceLabel(skill, t)}
                              </Badge>
                              <span className="truncate font-mono">
                                {skill.baseDir || t('detail.pathUnavailable')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-6" onClick={(event) => event.stopPropagation()}>
                          {skill.version && (
                            <span className="text-[13px] font-mono text-muted-foreground">
                              v{skill.version}
                            </span>
                          )}
                          <Switch
                            checked={skill.enabled}
                            onCheckedChange={(checked) => void handleToggle(skill.id, checked)}
                            disabled={skill.isCore}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Sheet open={installSheetOpen} onOpenChange={setInstallSheetOpen}>
        <SheetContent
          data-testid="skills-install-drawer"
          className="flex w-full flex-col border-l border-black/10 p-0 shadow-[0_0_40px_rgba(0,0,0,0.2)] dark:border-white/10 sm:max-w-[560px]"
          side="right"
        >
          <div className="border-b border-black/10 px-7 py-6 dark:border-white/10">
            <h2 className="text-[24px] font-normal tracking-tight text-foreground" style={{ fontFamily: 'Georgia, Cambria, \"Times New Roman\", Times, serif' }}>{t('marketplace.installDialogTitle')}</h2>
            <p className="mt-1 text-[13px] text-foreground/70">{t('marketplace.installDialogSubtitle')}</p>
            <div className="mt-4 flex flex-col gap-2 md:flex-row">
              <div className="relative flex flex-1 items-center rounded-xl border border-black/10 bg-black/5 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  placeholder={t('searchMarketplace')}
                  value={installQuery}
                  onChange={(e) => setInstallQuery(e.target.value)}
                  className="ml-2 h-auto border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                {installQuery && (
                  <button type="button" onClick={() => setInstallQuery('')} className="ml-1 shrink-0 text-foreground/50 hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Button variant="outline" disabled className="h-10 rounded-xl border-black/10 bg-transparent text-muted-foreground dark:border-white/10">
                {t('marketplace.sourceLabel')}: {t('marketplace.sourceClawHub')}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {searchError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm font-medium text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>
                  {SEARCH_ERROR_CODES.has(searchError.replace('Error: ', ''))
                    ? t(`toast.${searchError.replace('Error: ', '')}`, { path: skillsDirPath })
                    : t('marketplace.searchError')}
                </span>
              </div>
            )}

            {searching && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-sm">{t('marketplace.searching')}</p>
              </div>
            )}

            {!searching && searchResults.length > 0 && (
              <div className="flex flex-col gap-1">
                {searchResults.map((skill) => {
                  const isInstalled = safeSkills.some((installedSkill) => installedSkill.id === skill.slug || installedSkill.name === skill.name);
                  const isInstallLoading = !!installing[skill.slug];

                  return (
                    <div
                      key={skill.slug}
                      className="group flex cursor-pointer flex-row items-center justify-between rounded-xl border-b border-black/5 px-3 py-3.5 transition-colors hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5"
                      onClick={() => void invokeIpc('shell:openExternal', `https://clawhub.ai/s/${skill.slug}`)}
                    >
                      <div className="flex flex-1 items-start gap-4 overflow-hidden pr-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-black/5 text-xl dark:border-white/10 dark:bg-white/5">
                          📦
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <div className="mb-1 flex items-center gap-2">
                            <h3 className="truncate text-[15px] font-semibold text-foreground">{skill.name}</h3>
                            {skill.author && (
                              <span className="text-xs text-muted-foreground">• {skill.author}</span>
                            )}
                          </div>
                          <p className="line-clamp-1 pr-6 text-[13.5px] leading-relaxed text-muted-foreground">
                            {skill.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-4" onClick={(event) => event.stopPropagation()}>
                        {skill.version && (
                          <span className="mr-2 text-[13px] font-mono text-muted-foreground">
                            v{skill.version}
                          </span>
                        )}
                        {isInstalled ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => void handleUninstall(skill.slug)}
                            disabled={isInstallLoading}
                            className="h-8 shadow-none"
                          >
                            {isInstallLoading ? <LoadingSpinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => void handleInstall(skill.slug)}
                            disabled={isInstallLoading}
                            className="h-8 rounded-full px-4 text-xs font-medium shadow-none"
                          >
                            {isInstallLoading ? <LoadingSpinner size="sm" /> : t('marketplace.install', 'Install')}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!searching && searchResults.length === 0 && !searchError && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Package className="mb-4 h-10 w-10 opacity-50" />
                <p>{installQuery.trim() ? t('marketplace.noResults') : t('marketplace.emptyPrompt')}</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <SkillDetailDialog
        skill={selectedSkill}
        isOpen={!!selectedSkill}
        onClose={() => setSelectedSkill(null)}
        onToggle={(enabled) => {
          if (!selectedSkill) return;
          void handleToggle(selectedSkill.id, enabled);
          setSelectedSkill({ ...selectedSkill, enabled });
        }}
        onUninstall={handleUninstall}
        onOpenFolder={handleOpenSkillFolder}
      />
    </div>
  );
}

export default Skills;
