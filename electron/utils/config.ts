/**
 * Application Configuration
 * Centralized configuration constants and helpers
 */

/**
 * Port configuration
 */
export const PORTS = {
  /** OpenClaw GUI development server port */
  OPENCLAWPRO_DEV: 5173,

  /** OpenClaw GUI production port (for reference) */
  OPENCLAWPRO_GUI: 23333,

  /** Local host API server port */
  OPENCLAWPRO_HOST_API: 3210,
  CLAWX_HOST_API: 3210,
  /** OpenClaw Gateway port */
  OPENCLAW_GATEWAY: 18789,
} as const;

/**
 * Get port from environment or default
 */
const PORT_KEY_ALIASES: Partial<Record<keyof typeof PORTS, Array<keyof typeof PORTS>>> = {
  OPENCLAWPRO_HOST_API: ['CLAWX_HOST_API'],
  CLAWX_HOST_API: ['OPENCLAWPRO_HOST_API'],
};

export function getPort(key: keyof typeof PORTS): number {
  const candidateKeys = [key, ...(PORT_KEY_ALIASES[key] ?? [])];

  for (const candidateKey of candidateKeys) {
    for (const envKey of [`OPENCLAWPRO_PORT_${candidateKey}`, `CLAWX_PORT_${candidateKey}`]) {
      const envValue = process.env[envKey];
      if (!envValue) continue;
      const parsed = parseInt(envValue, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return PORTS[key];
}

/**
 * Application paths
 */
export const APP_PATHS = {
  /** OpenClaw configuration directory */
  OPENCLAW_CONFIG: '~/.openclaw',

  /** OpenClaw configuration directory */
  OPENCLAWPRO_CONFIG: '~/.openclawpro',

  /** Log files directory */
  LOGS: '~/.openclawpro/logs',
} as const;

/**
 * Update channels
 */
export const UPDATE_CHANNELS = ['stable', 'beta', 'dev'] as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

/**
 * Default update configuration
 */
export const UPDATE_CONFIG = {
  /** Check interval in milliseconds (6 hours) */
  CHECK_INTERVAL: 6 * 60 * 60 * 1000,

  /** Default update channel */
  DEFAULT_CHANNEL: 'stable' as UpdateChannel,

  /** Auto download updates */
  AUTO_DOWNLOAD: false,

  /** Show update notifications */
  SHOW_NOTIFICATION: true,
};

/**
 * Gateway configuration
 */
export const GATEWAY_CONFIG = {
  /** WebSocket reconnection delay (ms) */
  RECONNECT_DELAY: 5000,

  /** RPC call timeout (ms) */
  RPC_TIMEOUT: 30000,

  /** Health check interval (ms) */
  HEALTH_CHECK_INTERVAL: 30000,

  /** Maximum startup retries */
  MAX_STARTUP_RETRIES: 30,

  /** Startup retry interval (ms) */
  STARTUP_RETRY_INTERVAL: 1000,
};
