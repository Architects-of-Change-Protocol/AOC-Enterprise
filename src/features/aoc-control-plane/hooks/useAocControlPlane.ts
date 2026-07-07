import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';
import type { AocControlPlaneFilter } from '../domain/control-plane-filter.js';
import { useAocSelection, type UseAocSelectionResult } from './useAocSelection.js';
import { useAocFilters, type UseAocFiltersResult } from './useAocFilters.js';

export interface UseAocControlPlaneResult {
  readonly readModel: AocControlPlaneReadModel;
  readonly selection: UseAocSelectionResult;
  readonly filters: UseAocFiltersResult;
}

/**
 * Combines section navigation and filter/search state around an
 * already-built AocControlPlaneReadModel. It never builds the read model
 * itself -- callers own that (typically via ControlPlaneReadModelService),
 * since this hook has no opinion about where the runtime state came from.
 */
export function useAocControlPlane(readModel: AocControlPlaneReadModel, initialFilter?: AocControlPlaneFilter): UseAocControlPlaneResult {
  const selection = useAocSelection();
  const filters = useAocFilters(readModel, initialFilter);
  return { readModel, selection, filters };
}
