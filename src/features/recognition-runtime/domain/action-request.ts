import type { EvidenceItem } from './evidence.js';

export interface ActionRequest {
  readonly id: string;
  readonly actorId: string;
  readonly passportId?: string;
  readonly capabilityTokenId?: string;
  readonly trustDomainId: string;
  readonly action: string;
  readonly resource: string;
  readonly principalActorId?: string;
  readonly context?: Readonly<Record<string, string>>;
  readonly evidence?: readonly EvidenceItem[];
  readonly requestedAt: string;
}
