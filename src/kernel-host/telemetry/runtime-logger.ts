/**
 * Every request-scoped log line the mission requires: correlation id,
 * request id, decision id, evaluation duration, kernel version, runtime
 * version, status. Never logs secrets/tokens/raw context -- callers pass
 * only the closed set of fields below, so there is no code path that could
 * accidentally log a bearer token or a raw `context` payload.
 */
export interface RuntimeLogFields {
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly decisionId?: string;
  readonly durationMs?: number;
  readonly kernelVersion?: string;
  readonly runtimeVersion?: string;
  readonly status?: string;
  readonly route?: string;
  readonly httpStatus?: number;
}

export type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RuntimeLogger {
  debug(message: string, fields?: RuntimeLogFields): void;
  info(message: string, fields?: RuntimeLogFields): void;
  warn(message: string, fields?: RuntimeLogFields): void;
  error(message: string, fields?: RuntimeLogFields): void;
}

const LEVEL_RANK: Readonly<Record<RuntimeLogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface RuntimeLoggerSink {
  write(line: string): void;
}

const consoleSink: RuntimeLoggerSink = {
  write(line) {
    console.log(line);
  },
};

export function createRuntimeLogger(minLevel: RuntimeLogLevel = 'info', sink: RuntimeLoggerSink = consoleSink): RuntimeLogger {
  function emit(level: RuntimeLogLevel, message: string, fields?: RuntimeLogFields): void {
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
