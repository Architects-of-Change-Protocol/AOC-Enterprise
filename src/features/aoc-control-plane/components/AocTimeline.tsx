import * as React from 'react';
import type { AocTimelineItem } from '../domain/control-plane-timeline.js';
import { AocEmptyState } from './AocEmptyState.js';

const STATUS_SYMBOL: Record<AocTimelineItem['status'], string> = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  danger: '✕',
};

export interface AocTimelineProps {
  readonly items: readonly AocTimelineItem[];
  readonly limit?: number;
}

export function AocTimeline({ items, limit }: AocTimelineProps): React.ReactElement {
  if (items.length === 0) {
    return <AocEmptyState message="No activity recorded yet." />;
  }
  const visible = limit !== undefined ? items.slice(0, limit) : items;
  return (
    <ol className="aoc-timeline">
      {visible.map((item) => (
        <li key={item.id} className={`aoc-timeline__item aoc-timeline__item--${item.status}`}>
          <span className="aoc-timeline__symbol" aria-hidden="true">
            {STATUS_SYMBOL[item.status]}
          </span>
          <div className="aoc-timeline__body">
            <p className="aoc-timeline__title">
              <strong>{item.title}</strong> <span className="aoc-timeline__source">({item.source})</span>
            </p>
            <p className="aoc-timeline__description">{item.description}</p>
            <time className="aoc-timeline__timestamp" dateTime={item.timestamp}>
              {item.timestamp}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
