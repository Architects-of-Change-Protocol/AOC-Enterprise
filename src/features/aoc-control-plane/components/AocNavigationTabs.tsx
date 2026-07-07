import * as React from 'react';
import { AOC_NAVIGATION_ITEMS, type AocSection } from '../domain/control-plane-navigation.js';

export interface AocNavigationTabsProps {
  readonly selected: AocSection;
  readonly onSelect: (section: AocSection) => void;
}

export function AocNavigationTabs({ selected, onSelect }: AocNavigationTabsProps): React.ReactElement {
  return (
    <nav className="aoc-navigation-tabs" aria-label="AOC Control Plane sections">
      <ul role="tablist">
        {AOC_NAVIGATION_ITEMS.map((item) => {
          const isSelected = item.section === selected;
          return (
            <li key={item.section} role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-current={isSelected ? 'page' : undefined}
                className={`aoc-navigation-tabs__tab${isSelected ? ' aoc-navigation-tabs__tab--selected' : ''}`}
                title={item.description}
                onClick={() => onSelect(item.section)}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
