import * as React from 'react';

export interface AocSearchInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
}

export function AocSearchInput({ value, onChange, placeholder }: AocSearchInputProps): React.ReactElement {
  return (
    <input
      type="search"
      className="aoc-search-input"
      role="searchbox"
      aria-label="Search actor, action, resource scope, reason code or proof hash"
      placeholder={placeholder ?? 'Search actorId, action, resourceScope, reasonCode, proofHash…'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
