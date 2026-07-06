import type { Actor } from '../domain/actor.js';
import type { Passport } from '../domain/passport.js';
import type { TrustDomain } from '../domain/trust-domain.js';
import type { AocRecognitionRuntime } from '../runtime/aoc-recognition-runtime.js';

export interface DatasysAgentRepublicWorld {
  readonly trustDomain: TrustDomain;
  readonly datasys: Actor;
  readonly victor: Actor;
  readonly pmfreak: Actor;
  readonly unknownAgent: Actor;
  readonly datasysPassport: Passport;
  readonly victorPassport: Passport;
  readonly pmfreakPassport: Passport;
}

const PASSPORT_EXPIRY = '2027-01-01T00:00:00.000Z';

export function buildDatasysAgentRepublicWorld(runtime: AocRecognitionRuntime): DatasysAgentRepublicWorld {
  const datasys = runtime.registerActor({
    id: 'actor-datasys',
    type: 'organization',
    displayName: 'Datasys',
  });

  const trustDomain = runtime.createTrustDomain({
    id: 'trust-domain-datasys-agent-republic',
    name: 'Datasys Agent Republic',
    issuerActorId: datasys.id,
    acceptedIssuerIds: [datasys.id],
    acceptedActorTypes: ['human', 'organization', 'agent'],
    policyPackIds: ['datasys-agent-republic-core'],
  });

  const victor = runtime.registerActor({
    id: 'actor-victor-valverde',
    type: 'human',
    displayName: 'Victor Valverde',
    issuerId: datasys.id,
    trustDomainId: trustDomain.id,
  });

  const pmfreak = runtime.registerActor({
    id: 'actor-pmfreak-closure-agent',
    type: 'agent',
    displayName: 'PMFreak Closure Agent',
    issuerId: datasys.id,
    trustDomainId: trustDomain.id,
  });

  const unknownAgent = runtime.registerActor({
    id: 'actor-unknown-external-agent',
    type: 'external',
    displayName: 'Unknown External Agent',
    status: 'unknown',
  });

  const datasysPassport = runtime.issuePassport({
    id: 'passport-datasys',
    type: 'organization_passport',
    subjectActorId: datasys.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    claims: { role: 'trust-domain-issuer' },
  });

  const victorPassport = runtime.issuePassport({
    id: 'passport-victor',
    type: 'human_passport',
    subjectActorId: victor.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    expiresAt: PASSPORT_EXPIRY,
    claims: { role: 'project-lead' },
  });

  const pmfreakPassport = runtime.issuePassport({
    id: 'passport-pmfreak',
    type: 'agent_passport',
    subjectActorId: pmfreak.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    expiresAt: PASSPORT_EXPIRY,
    claims: { role: 'closure-agent' },
  });

  return {
    trustDomain,
    datasys,
    victor,
    pmfreak,
    unknownAgent,
    datasysPassport,
    victorPassport,
    pmfreakPassport,
  };
}
