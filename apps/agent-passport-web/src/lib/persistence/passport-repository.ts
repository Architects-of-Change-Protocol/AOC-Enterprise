import type { IssuedAgentPassportBundle } from '@aoc-enterprise/agent-governance';

export interface UpdatePassportStatusInput {
  readonly passportId: string;
  readonly status: string;
  readonly reason?: string;
  readonly actorId?: string;
  readonly occurredAt?: string;
}

export interface RevokePassportInput {
  readonly passportId: string;
  readonly reason: string;
  readonly actorId?: string;
  readonly occurredAt?: string;
}

export interface PassportRepository {
  saveBundle(bundle: IssuedAgentPassportBundle): Promise<void>;
  getBundle(passportId: string): Promise<IssuedAgentPassportBundle | undefined>;
  listPassportIds(): Promise<string[]>;
  listBundles(): Promise<IssuedAgentPassportBundle[]>;
  updateStatus(input: UpdatePassportStatusInput): Promise<void>;
  revokePassport(input: RevokePassportInput): Promise<void>;
}
