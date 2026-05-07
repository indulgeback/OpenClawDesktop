import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Agents } from '../../src/pages/Agents/index';

const hostApiFetchMock = vi.fn();
const subscribeHostEventMock = vi.fn();
const fetchAgentsMock = vi.fn();
const updateAgentMock = vi.fn();
const updateAgentModelMock = vi.fn();
const createAgentFromTemplateMock = vi.fn();
const refreshProviderSnapshotMock = vi.fn();
const switchSessionMock = vi.fn();

const { gatewayState, agentsState, providersState } = vi.hoisted(() => ({
  gatewayState: {
    status: { state: 'running', port: 18789 },
  },
  agentsState: {
    agents: [] as Array<Record<string, unknown>>,
    defaultModelRef: null as string | null,
    loading: false,
    error: null as string | null,
  },
  providersState: {
    accounts: [] as Array<Record<string, unknown>>,
    statuses: [] as Array<Record<string, unknown>>,
    vendors: [] as Array<Record<string, unknown>>,
    defaultAccountId: '' as string,
  },
}));

vi.mock('@/stores/gateway', () => ({
  useGatewayStore: (selector: (state: typeof gatewayState) => unknown) => selector(gatewayState),
}));

vi.mock('@/stores/agents', () => ({
  useAgentsStore: (selector?: (state: typeof agentsState & {
    fetchAgents: typeof fetchAgentsMock;
    updateAgent: typeof updateAgentMock;
    updateAgentModel: typeof updateAgentModelMock;
    createAgent: ReturnType<typeof vi.fn>;
    createAgentFromTemplate: typeof createAgentFromTemplateMock;
    deleteAgent: ReturnType<typeof vi.fn>;
  }) => unknown) => {
    const state = {
      ...agentsState,
      fetchAgents: fetchAgentsMock,
      updateAgent: updateAgentMock,
      updateAgentModel: updateAgentModelMock,
      createAgent: vi.fn(),
      createAgentFromTemplate: createAgentFromTemplateMock,
      deleteAgent: vi.fn(),
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/stores/chat', () => ({
  useChatStore: (selector: (state: { switchSession: typeof switchSessionMock }) => unknown) => selector({
    switchSession: switchSessionMock,
  }),
}));

vi.mock('@/stores/providers', () => ({
  useProviderStore: (selector: (state: typeof providersState & {
    refreshProviderSnapshot: typeof refreshProviderSnapshotMock;
  }) => unknown) => {
    const state = {
      ...providersState,
      refreshProviderSnapshot: refreshProviderSnapshotMock,
    };
    return selector(state);
  },
}));

vi.mock('@/lib/host-api', () => ({
  hostApiFetch: (...args: unknown[]) => hostApiFetchMock(...args),
}));

vi.mock('@/lib/host-events', () => ({
  subscribeHostEvent: (...args: unknown[]) => subscribeHostEventMock(...args),
}));

vi.mock('@/lib/agent-market', () => ({
  getAgentMarketCatalog: () => ({
    sourceRepo: 'test',
    sourceCommit: 'test',
    sourceCommitShort: 'test',
    generatedAt: '2026-01-01T00:00:00.000Z',
    categories: [{ id: 'engineering', name: 'Engineering', count: 0 }],
    templates: [],
  }),
  loadAgentTemplateDetail: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('Agents page status refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gatewayState.status = { state: 'running', port: 18789 };
    agentsState.agents = [];
    agentsState.defaultModelRef = null;
    providersState.accounts = [];
    providersState.statuses = [];
    providersState.vendors = [];
    providersState.defaultAccountId = '';
    fetchAgentsMock.mockResolvedValue(undefined);
    updateAgentMock.mockResolvedValue(undefined);
    updateAgentModelMock.mockResolvedValue(undefined);
    createAgentFromTemplateMock.mockResolvedValue(undefined);
    refreshProviderSnapshotMock.mockResolvedValue(undefined);
    switchSessionMock.mockClear();
    hostApiFetchMock.mockResolvedValue({
      success: true,
      channels: [],
    });
  });

  function renderAgents() {
    return render(
      <MemoryRouter>
        <Agents />
      </MemoryRouter>,
    );
  }

  it('refetches channel accounts when gateway channel-status events arrive', async () => {
    let channelStatusHandler: (() => void) | undefined;
    subscribeHostEventMock.mockImplementation((eventName: string, handler: () => void) => {
      if (eventName === 'gateway:channel-status') {
        channelStatusHandler = handler;
      }
      return vi.fn();
    });

    renderAgents();

    await waitFor(() => {
      expect(fetchAgentsMock).toHaveBeenCalledTimes(1);
      expect(hostApiFetchMock).toHaveBeenCalledWith('/api/channels/accounts');
    });
    expect(subscribeHostEventMock).toHaveBeenCalledWith('gateway:channel-status', expect.any(Function));

    await act(async () => {
      channelStatusHandler?.();
    });

    await waitFor(() => {
      const channelFetchCalls = hostApiFetchMock.mock.calls.filter(([path]) => path === '/api/channels/accounts');
      expect(channelFetchCalls).toHaveLength(2);
    });
  });

  it('refetches channel accounts when the gateway transitions to running after mount', async () => {
    gatewayState.status = { state: 'starting', port: 18789 };

    const { rerender } = render(
      <MemoryRouter>
        <Agents />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchAgentsMock).toHaveBeenCalledTimes(1);
      expect(hostApiFetchMock).toHaveBeenCalledWith('/api/channels/accounts');
    });

    gatewayState.status = { state: 'running', port: 18789 };
    await act(async () => {
      rerender(
        <MemoryRouter>
          <Agents />
        </MemoryRouter>,
      );
    });

    await waitFor(() => {
      const channelFetchCalls = hostApiFetchMock.mock.calls.filter(([path]) => path === '/api/channels/accounts');
      expect(channelFetchCalls).toHaveLength(2);
    });
  });

  it('uses "Use default model" as form fill only and disables it when already default', async () => {
    agentsState.agents = [
      {
        id: 'main',
        name: 'Main',
        isDefault: true,
        modelDisplay: 'claude-opus-4.6',
        modelRef: 'openrouter/anthropic/claude-opus-4.6',
        overrideModelRef: null,
        inheritedModel: true,
        workspace: '~/.openclaw/workspace',
        agentDir: '~/.openclaw/agents/main/agent',
        mainSessionKey: 'agent:main:desk',
        channelTypes: [],
      },
    ];
    agentsState.defaultModelRef = 'openrouter/anthropic/claude-opus-4.6';
    providersState.accounts = [
      {
        id: 'openrouter-default',
        label: 'OpenRouter',
        vendorId: 'openrouter',
        authMode: 'api_key',
        model: 'openrouter/anthropic/claude-opus-4.6',
        enabled: true,
        createdAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
      },
    ];
    providersState.statuses = [{ id: 'openrouter-default', hasKey: true }];
    providersState.vendors = [
      { id: 'openrouter', name: 'OpenRouter', modelIdPlaceholder: 'anthropic/claude-opus-4.6' },
    ];
    providersState.defaultAccountId = 'openrouter-default';

    renderAgents();

    await waitFor(() => {
      expect(fetchAgentsMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId('agents-scene-manage'));
    fireEvent.click(screen.getByTestId('agent-settings-main'));
    fireEvent.click(screen.getByText('settingsDialog.modelLabel').closest('button') as HTMLButtonElement);

    const useDefaultButton = await screen.findByRole('button', { name: 'settingsDialog.useDefaultModel' });
    const modelIdInput = screen.getByLabelText('settingsDialog.modelIdLabel');
    const saveButton = screen.getByRole('button', { name: 'common:actions.save' });

    expect(useDefaultButton).toBeDisabled();

    fireEvent.change(modelIdInput, { target: { value: 'anthropic/claude-sonnet-4.5' } });
    expect(useDefaultButton).toBeEnabled();
    expect(saveButton).toBeEnabled();

    fireEvent.click(useDefaultButton);

    expect(updateAgentModelMock).not.toHaveBeenCalled();
    expect((modelIdInput as HTMLInputElement).value).toBe('anthropic/claude-opus-4.6');
    expect(useDefaultButton).toBeDisabled();
  });

  it('keeps the last agent snapshot visible while a refresh is in flight', async () => {
    agentsState.agents = [
      {
        id: 'main',
        name: 'Main',
        isDefault: true,
        modelDisplay: 'gpt-5',
        modelRef: 'openai/gpt-5',
        overrideModelRef: null,
        inheritedModel: true,
        workspace: '~/.openclaw/workspace',
        agentDir: '~/.openclaw/agents/main/agent',
        mainSessionKey: 'agent:main:main',
        channelTypes: [],
      },
    ];

    const { rerender } = render(
      <MemoryRouter>
        <Agents />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId('agents-scene-manage'));
    expect(await screen.findByText('Main')).toBeInTheDocument();

    agentsState.loading = true;
    await act(async () => {
      rerender(
        <MemoryRouter>
          <Agents />
        </MemoryRouter>,
      );
    });

    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the blocking spinner during the initial load before any stable snapshot exists', async () => {
    agentsState.loading = true;
    fetchAgentsMock.mockImplementation(() => new Promise(() => {}));
    refreshProviderSnapshotMock.mockImplementation(() => new Promise(() => {}));
    hostApiFetchMock.mockImplementation(() => new Promise(() => {}));

    const { container } = render(
      <MemoryRouter>
        <Agents />
      </MemoryRouter>,
    );

    expect(container.querySelector('svg.animate-spin')).toBeTruthy();
    expect(screen.queryByText('title')).not.toBeInTheDocument();
  });
});
