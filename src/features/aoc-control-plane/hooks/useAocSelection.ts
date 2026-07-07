import * as React from 'react';
import type { AocSection } from '../domain/control-plane-navigation.js';

export interface UseAocSelectionResult {
  readonly section: AocSection;
  readonly setSection: (section: AocSection) => void;
}

/** Tracks which Control Plane section is active. Pure UI navigation state -- it decides nothing about governance. */
export function useAocSelection(initialSection: AocSection = 'overview'): UseAocSelectionResult {
  const [section, setSection] = React.useState<AocSection>(initialSection);
  return { section, setSection };
}
