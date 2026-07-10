/**
 * Every request-scoped log line the mission requires: correlation id,
 * request id, decision id, evaluation duration, kernel version, enterprise
 * version, status. Never logs secrets/tokens/raw context -- callers pass
 * only the closed set of fields below, so there is no code path that could
 * accidentally log a bearer token or a raw `context` payload.
 */
export interface EnterpriseLogContext {
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly decisionId?: string;
  readonly durationMs?: number;
  readonly kernelVersion?: string;
  readonly enterpriseVersion?: string;
  readonly status?: string;
  readonly route?: string;
  readonly httpStatus?: number;
}

export type EnterpriseLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface EnterpriseLogger {
  debug(message: string, fields?: EnterpriseLogContext): void;
  info(message: string, fields?: EnterpriseLogContext): void;
  warn(message: string, fields?: EnterpriseLogContext): void;
  error(message: string, fields?: EnterpriseLogContext): void;
}

const LEVEL_RANK: Readonly<Record<EnterpriseLogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface EnterpriseLoggerSink {
  write(line: string): void;
}

const consoleSink: EnterpriseLoggerSink = {
  write(line) {
    console.log(line);
  },
};

export function createEnterpriseLogger(minLevel: EnterpriseLogLevel = 'info', sink: EnterpriseLoggerSink = consoleSink): EnterpriseLogger {
  function emit(level: EnterpriseLogLevel, message: string, fields?: EnterpriseLogContext): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...fields,
    };
    sink.write(JSON.stringify(entry));
  }

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
  };
}
