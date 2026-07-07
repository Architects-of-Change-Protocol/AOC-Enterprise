import * as React from 'react';
import type { AocControlPlaneFilter } from '../domain/control-plane-filter.js';
import { EMPTY_FILTER } from '../domain/control-plane-filter.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';
import { queryReadModel, type ControlPlaneSearchableItem } from '../services/control-plane-query-service.js';

export interface UseAocFiltersResult {
  readonly filter: AocControlPlaneFilter;
  readonly setFilter: (filter: AocControlPlaneFilter) => void;
  readonly setSearch: (search: string) => void;
  readonly results: readonly ControlPlaneSearchableItem[];
}

/** Thin React binding over the pure query service -- all filtering/search logic still lives in control-plane-query-service.ts. */
export function useAocFilters(readModel: AocControlPlaneReadModel, initialFilter: AocControlPlaneFilter = EMPTY_FILTER): UseAocFiltersResult {
  const [filter, setFilter] = React.useState<AocControlPlaneFilter>(initialFilter);

  const setSearch = React.useCallback((search: string) => {
    setFilter((current) => {
      if (search === '') {
        const { search: _omit, ...rest } = current;
        return rest;
      }
      return { ...current, search };
    });
  }, []);

  const results = React.useMemo(() => queryReadModel(readModel, filter), [readModel, filter]);

  return { filter, setFilter, setSearch, results };
}
