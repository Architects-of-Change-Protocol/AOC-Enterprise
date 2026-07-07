import * as React from 'react';
import type { ControlPlaneCommandResult } from '../domain/control-plane-command.js';

export interface UseAocCommandsResult {
  readonly lastResult: ControlPlaneCommandResult | undefined;
  readonly pending: boolean;
  readonly run: (command: () => ControlPlaneCommandResult | Promise<ControlPlaneCommandResult>) => Promise<ControlPlaneCommandResult>;
}

/**
 * Thin React binding for dispatching a ControlPlaneCommandService call and
 * tracking its result. It never fabricates a result -- `run` always awaits
 * whatever the command service actually returned.
 */
export function useAocCommands(): UseAocCommandsResult {
  const [lastResult, setLastResult] = React.useState<ControlPlaneCommandResult | undefined>(undefined);
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(async (command: () => ControlPlaneCommandResult | Promise<ControlPlaneCommandResult>) => {
    setPending(true);
    try {
      const result = await command();
      setLastResult(result);
      return result;
    } finally {
      setPending(false);
    }
  }, []);

  return { lastResult, pending, run };
}
