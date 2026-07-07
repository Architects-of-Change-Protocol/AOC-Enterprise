import type { AocGovernanceSource } from './control-plane-navigation.js';
import type { AocTimelineStatus } from './control-plane-status.js';

export interface AocTimelineItem {
  readonly id: string;
  readonly source: AocGovernanceSource;
  readonly type: string;
  readonly title: string;
  readonly description: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly resourceScope?: string;
  readonly status: AocTimelineStatus;
  readonly timestamp: string;
  readonly relatedProofId?: string;
  readonly relatedDecisionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
