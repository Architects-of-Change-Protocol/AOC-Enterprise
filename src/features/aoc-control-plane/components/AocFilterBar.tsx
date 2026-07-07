import * as React from 'react';
import type { AocControlPlaneFilter } from '../domain/control-plane-filter.js';
import type { AocGovernanceSource } from '../domain/control-plane-navigation.js';

export interface AocFilterBarProps {
  readonly filter: AocControlPlaneFilter;
  readonly onChange: (filter: AocControlPlaneFilter) => void;
  readonly availableStatuses?: readonly string[];
  readonly availableSources?: readonly AocGovernanceSource[];
}

function withField<K extends keyof AocControlPlaneFilter>(
  filter: AocControlPlaneFilter,
  key: K,
  value: string,
): AocControlPlaneFilter {
  const next = { ...filter };
  if (value === '') {
    delete next[key];
  } else {
    (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

const DEFAULT_SOURCES: readonly AocGovernanceSource[] = ['recognition', 'authority', 'approval', 'handshake', 'enforcement'];

/** A pure filter form: it only ever produces a new AocControlPlaneFilter object, never evaluates governance state itself. */
export function AocFilterBar({ filter, onChange, availableStatuses, availableSources }: AocFilterBarProps): React.ReactElement {
  return (
    <div className="aoc-filter-bar" role="search" aria-label="Filters">
      <label className="aoc-filter-bar__field">
        Trust domain
        <input
          type="text"
          value={filter.trustDomainId ?? ''}
          onChange={(event) => onChange(withField(filter, 'trustDomainId', event.target.value))}
        />
      </label>
      <label className="aoc-filter-bar__field">
        Actor
        <input type="text" value={filter.actorId ?? ''} onChange={(event) => onChange(withField(filter, 'actorId', event.target.value))} />
      </label>
      <label className="aoc-filter-bar__field">
        Action
        <input type="text" value={filter.action ?? ''} onChange={(event) => onChange(withField(filter, 'action', event.target.value))} />
      </label>
      <label className="aoc-filter-bar__field">
        Resource scope
        <input
          type="text"
          value={filter.resourceScope ?? ''}
          onChange={(event) => onChange(withField(filter, 'resourceScope', event.target.value))}
        />
      </label>
      <label className="aoc-filter-bar__field">
        Source
        <select value={filter.source ?? ''} onChange={(event) => onChange(withField(filter, 'source', event.target.value))}>
          <option value="">All sources</option>
          {(availableSources ?? DEFAULT_SOURCES).map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      </label>
      <label className="aoc-filter-bar__field">
        Status
        <select value={filter.status ?? ''} onChange={(event) => onChange(withField(filter, 'status', event.target.value))}>
          <option value="">All statuses</option>
          {(availableStatuses ?? []).map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
