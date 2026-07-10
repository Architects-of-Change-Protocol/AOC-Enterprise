/**
 * Centralizes every environment-derived knob the Runtime Host needs. The
 * Kernel itself takes none of this -- `AocKernel` is constructed once by the
 * composition root (`dependency-injection/composition-root.ts`) and never
 * reads configuration directly, per the mission's "Kernel remains
 * configuration-independent" principle.
 */
export type RuntimeEnvironment = 'development' | 'test' | 'staging' | 'production';

export type RuntimePersistenceProviderKind = 'memory' | 'sqlite';

/** A configured caller credential. `organizationId`, when present, scopes the key to requests naming that same `organization.id` -- a request for a different organization is a 403, not a 401 (the key is valid; it just isn't authorized for that organization). */
export interface RuntimeApiKey {
  readonly key: string;
  readonly organizationId?: string;
}

export interface RuntimeFeatureFlags {
  readonly traceLevel: 'basic' | 'full';
  readonly requireAuthentication: boolean;
}

export interface RuntimeConfiguration {
  readonly environment: RuntimeEnvironment;
  readonly runtimeVersion: string;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  readonly persistence: {
    readonly provider: RuntimePersistenceProviderKind;
    readonly sqlitePath: string;
  };
  readonly eventPublishing: {
    readonly enabled: boolean;
  };
  readonly telemetry: {
    readonly enabled: boolean;
  };
  readonly authentication: {
    /** Static bearer tokens accepted by the Runtime Host's own authentication step. Never forwarded to the Kernel. */
    readonly apiKeys: readonly RuntimeApiKey[];
  };
  readonly features: RuntimeFeatureFlags;
  readonly http: {
    readonly port: number;
    readonly host: string;
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function parseEnvironment(value: string | undefined): RuntimeEnvironment {
  if (value === 'production' || value === 'staging' || value === 'test' || value === 'development') return value;
  return 'development';
}

/** Parses `AOC_RUNTIME_API_KEYS="key1,key2:org-acme,key3:org-beta"` -- a bare key grants access regardless of the request's organization; a `key:orgId` pair scopes it. */
function parseApiKeys(value: string | undefined): readonly RuntimeApiKey[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const separatorIndex = entry.indexOf(':');
      if (separatorIndex === -1) return { key: entry };
      const key = entry.slice(0, separatorIndex).trim();
      const organizationId = entry.slice(separatorIndex + 1).trim();
      return organizationId.length > 0 ? { key, organizationId } : { key };
    });
}

/**
 * Reads `env` (defaults to `process.env`) into a fully-resolved
 * `RuntimeConfiguration`. Every field has a safe, local-dev-friendly
 * default so the Runtime Host can boot with zero configuration; production
 * deployments override via environment variables.
 */
export function loadRuntimeConfiguration(env: Readonly<Record<string, string | undefined>> = process.env): RuntimeConfiguration {
  return {
    environment: parseEnvironment(env.AOC_RUNTIME_ENV),
    runtimeVersion: env.AOC_RUNTIME_HOST_VERSION ?? '1.0.0',
    logLevel: (env.AOC_RUNTIME_LOG_LEVEL as RuntimeConfiguration['logLevel'] | undefined) ?? 'info',
    persistence: {
      provider: env.AOC_RUNTIME_PERSISTENCE_PROVIDER === 'sqlite' ? 'sqlite' : 'memory',
      sqlitePath: env.AOC_RUNTIME_SQLITE_PATH ?? '.data/kernel-host.sqlite',
    },
    eventPublishing: {
      enabled: parseBoolean(env.AOC_RUNTIME_EVENTS_ENABLED, true),
    },
    telemetry: {
      enabled: parseBoolean(env.AOC_RUNTIME_TELEMETRY_ENABLED, true),
    },
    authentication: {
      apiKeys: parseApiKeys(env.AOC_RUNTIME_API_KEYS),
    },
    features: {
      traceLevel: env.AOC_RUNTIME_TRACE_LEVEL === 'full' ? 'full' : 'basic',
      requireAuthentication: parseBoolean(env.AOC_RUNTIME_REQUIRE_AUTH, false),
    },
    http: {
      port: Number.parseInt(env.AOC_RUNTIME_HTTP_PORT ?? '8787', 10),
      host: env.AOC_RUNTIME_HTTP_HOST ?? '0.0.0.0',
    },
  };
}

/**
 * A short, stable checksum of the resolved configuration (never the raw
 * values -- `apiKeys` are secrets) so `/health` can report "configuration
 * changed since last deploy" without leaking what changed.
 */
export function computeConfigurationChecksum(config: RuntimeConfiguration): string {
  const shape = {
    environment: config.environment,
    runtimeVersion: config.runtimeVersion,
    logLevel: config.logLevel,
    persistenceProvider: config.persistence.provider,
    eventsEnabled: config.eventPublishing.enabled,
    telemetryEnabled: config.telemetry.enabled,
    apiKeyCount: config.authentication.apiKeys.length,
    traceLevel: config.features.traceLevel,
    requireAuthentication: config.features.requireAuthentication,
  };
  const serialized = JSON.stringify(shape);
  let hash = 0;
  for (let i = 0; i < serialized.length; i += 1) {
    hash = (Math.imul(31, hash) + serialized.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}
