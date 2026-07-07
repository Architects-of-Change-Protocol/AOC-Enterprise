import * as React from 'react';
import { AocDecisionBadge } from '../AocDecisionBadge.js';

export interface ExternalStandingBadgeProps {
  readonly status: string;
}

const STATUS_MAP: Record<string, 'allowed' | 'blocked' | 'pending' | 'revoked' | 'expired' | 'requires_attention'> = {
  known: 'allowed',
  trusted: 'allowed',
  suspended: 'requires_attention',
  revoked: 'revoked',
  quarantined: 'blocked',
  unknown: 'blocked',
};

export function ExternalStandingBadge({ status }: ExternalStandingBadgeProps): React.ReactElement {
  return <AocDecisionBadge status={STATUS_MAP[status] ?? 'blocked'} label={status} />;
}
