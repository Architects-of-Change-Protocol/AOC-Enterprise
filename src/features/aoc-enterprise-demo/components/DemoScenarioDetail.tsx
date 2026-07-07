import * as React from 'react';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoPersona } from '../domain/demo-persona.js';

export interface DemoScenarioDetailProps {
  readonly scenario: DemoScenario;
  readonly personas?: readonly DemoPersona[];
}

export function DemoScenarioDetail({ scenario, personas }: DemoScenarioDetailProps): React.ReactElement {
  const personasById = new Map((personas ?? []).map((persona) => [persona.id, persona]));

  return (
    <article className="aoc-demo-scenario-detail">
      <h2>{scenario.title}</h2>
      <p className="aoc-demo-scenario-detail__summary">{scenario.summary}</p>

      <section>
        <h3>Buyer pain</h3>
        <p>{scenario.buyerPain}</p>
      </section>
      <section>
        <h3>AOC value</h3>
        <p>{scenario.aocValue}</p>
      </section>
      <section>
        <h3>Personas</h3>
        <ul>
          {scenario.personas.map((personaId) => (
            <li key={personaId}>{personasById.get(personaId)?.displayName ?? personaId}</li>
          ))}
        </ul>
      </section>
      <dl className="aoc-demo-scenario-detail__facts">
        <dt>Action</dt>
        <dd>{scenario.action}</dd>
        <dt>Resource scope</dt>
        <dd>{scenario.resourceScope}</dd>
        <dt>Risk level</dt>
        <dd>{scenario.riskLevel}</dd>
        <dt>Expected outcome</dt>
        <dd>{scenario.expectedOutcome}</dd>
      </dl>
    </article>
  );
}
