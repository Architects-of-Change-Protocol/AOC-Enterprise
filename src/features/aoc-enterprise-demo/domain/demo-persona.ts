export type DemoPersonaType = 'human' | 'agent' | 'external_agent' | 'organization' | 'system';

export interface DemoPersona {
  readonly id: string;
  readonly displayName: string;
  readonly type: DemoPersonaType;
  readonly role: string;
  readonly description: string;
  readonly trustDomainId?: string;
  readonly actorId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
