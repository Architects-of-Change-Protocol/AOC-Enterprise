import type { RecognitionProof } from './proof.js';

export type PassportType = 'human_passport' | 'organization_passport' | 'agent_passport' | 'system_passport';

export type PassportStatus = 'valid' | 'expired' | 'suspended' | 'revoked';

export interface Passport {
  readonly id: string;
  readonly type: PassportType;
  readonly subjectActorId: string;
  readonly issuerActorId: string;
  readonly trustDomainId: string;
  readonly jurisdiction?: string;
  readonly status: PassportStatus;
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly claims: Readonly<Record<string, string>>;
  readonly proof?: RecognitionProof;
}
