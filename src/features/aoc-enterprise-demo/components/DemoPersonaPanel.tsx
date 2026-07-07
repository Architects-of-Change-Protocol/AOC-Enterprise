import * as React from 'react';
import type { DemoPersona } from '../domain/demo-persona.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoPersonaPanelProps {
  readonly personas: readonly DemoPersona[];
  readonly highlightedPersonaIds?: readonly string[];
}

export function DemoPersonaPanel({ personas, highlightedPersonaIds }: DemoPersonaPanelProps): React.ReactElement {
  if (personas.length === 0) {
    return <DemoEmptyState message="No personas defined for this scenario." />;
  }
  const highlighted = new Set(highlightedPersonaIds ?? []);

  return (
    <ul className="aoc-demo-persona-panel" aria-label="Scenario personas">
      {personas.map((persona) => (
        <li key={persona.id} className={highlighted.has(persona.id) ? 'aoc-demo-persona-panel__item aoc-demo-persona-panel__item--highlighted' : 'aoc-demo-persona-panel__item'}>
          <p className="aoc-demo-persona-panel__name">{persona.displayName}</p>
          <p className="aoc-demo-persona-panel__role">{persona.role}</p>
          <p className="aoc-demo-persona-panel__description">{persona.description}</p>
        </li>
      ))}
    </ul>
  );
}
