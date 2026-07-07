import * as React from 'react';
import type { AocOverviewViewModel } from '../domain/control-plane-view-model.js';
import type { AocSection } from '../domain/control-plane-navigation.js';
import type { AocTimelineItem } from '../domain/control-plane-timeline.js';
import { AocStatusCards } from './AocStatusCards.js';
import { AocTimeline } from './AocTimeline.js';
import { AocDecisionBadge } from './AocDecisionBadge.js';
import { AocEmptyState } from './AocEmptyState.js';

export interface AocOverviewDashboardProps {
  readonly overview: AocOverviewViewModel;
  readonly timeline: readonly AocTimelineItem[];
  readonly onNavigate?: (section: AocSection) => void;
}

const QUICK_LINKS: readonly { readonly section: AocSection; readonly label: string }[] = [
  { section: 'recognition', label: 'Recognition' },
  { section: 'authority', label: 'Authority' },
  { section: 'approvals', label: 'Approvals' },
  { section: 'external-agents', label: 'External Agents' },
  { section: 'enforcement', label: 'Enforcement' },
  { section: 'proofs', label: 'Proofs / Audit' },
];

export function AocOverviewDashboard({ overview, timeline, onNavigate }: AocOverviewDashboardProps): React.ReactElement {
  return (
    <section className="aoc-overview-dashboard" aria-label="Overview">
      <AocStatusCards metrics={overview.metrics} health={overview.health} />

      <nav className="aoc-overview-dashboard__quick-links" aria-label="Quick links">
        {QUICK_LINKS.map((link) => (
          <button type="button" key={link.section} onClick={() => onNavigate?.(link.section)}>
            {link.label}
          </button>
        ))}
      </nav>

      <div className="aoc-overview-dashboard__columns">
        <div>
          <h3>Recent decisions</h3>
          {overview.recentDecisions.length === 0 ? (
            <AocEmptyState message="No decisions recorded yet." />
          ) : (
            <ul className="aoc-overview-dashboard__decisions">
              {overview.recentDecisions.map((decision) => (
                <li key={decision.id}>
                  <AocDecisionBadge status={decision.status} />
                  <span className="aoc-overview-dashboard__decision-type">{decision.type}</span>
                  <span className="aoc-overview-dashboard__decision-reason">{decision.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3>Open items</h3>
          {overview.openItems.length === 0 ? (
            <AocEmptyState message="No open items requiring attention." />
          ) : (
            <ul className="aoc-overview-dashboard__open-items">
              {overview.openItems.map((item) => (
                <li key={item.id} className={`aoc-overview-dashboard__open-item aoc-overview-dashboard__open-item--${item.severity}`}>
                  <p className="aoc-overview-dashboard__open-item-title">{item.title}</p>
                  <p className="aoc-overview-dashboard__open-item-description">{item.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <h3>Recent activity</h3>
        <AocTimeline items={timeline} limit={20} />
      </div>
    </section>
  );
}
