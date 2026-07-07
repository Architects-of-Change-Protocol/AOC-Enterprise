import type { AgentVisa, AgentVisaStatus } from '../domain/agent-visa.js';
import type { ExternalAgentDescriptor } from '../domain/external-agent-descriptor.js';
import type { ExternalAgentStanding } from '../domain/external-agent-standing.js';
import type { ExternalAuthorityPresentation } from '../domain/external-authority-presentation.js';
import type { ExternalCapabilityRequest } from '../domain/external-capability-request.js';
import type { ExternalPassportPresentation } from '../domain/external-passport-presentation.js';
import type { ExternalTrustIssuer } from '../domain/external-trust-issuer.js';
import type { HandshakeChallenge } from '../domain/handshake-challenge.js';
import type { HandshakeDecision } from '../domain/handshake-decision.js';
import type { HandshakeEvent } from '../domain/handshake-event.js';
import type { HandshakeProof } from '../domain/handshake-proof.js';
import type { HandshakeRequest, HandshakeRequestStatus } from '../domain/handshake-request.js';
import type { HandshakeSession, HandshakeSessionStatus } from '../domain/handshake-session.js';
import type { IngressGrant, IngressGrantStatus } from '../domain/ingress-grant.js';
import type { TrustBoundary } from '../domain/trust-boundary.js';
import {
  AgentVisaNotFoundError,
  HandshakeRequestNotFoundError,
  HandshakeSessionNotFoundError,
  IngressGrantNotFoundError,
} from '../runtime/handshake-runtime-errors.js';

/**
 * In-memory store for every External Agent Handshake entity. Pure storage
 * and lookup -- issuance, policy evaluation and revocation rules live in the
 * services layer, mirroring ApprovalStore / AuthorityGraphStore.
 */
export class HandshakeStore {
  private readonly externalAgents = new Map<string, ExternalAgentDescriptor>();
  private readonly externalIssuers = new Map<string, ExternalTrustIssuer>();
  private readonly trustBoundaries = new Map<string, TrustBoundary>();
  private readonly passportPresentations = new Map<string, ExternalPassportPresentation>();
  private readonly authorityPresentations = new Map<string, ExternalAuthorityPresentation>();
  private readonly capabilityRequests = new Map<string, ExternalCapabilityRequest>();
  private readonly handshakeRequests = new Map<string, HandshakeRequest>();
  private readonly handshakeChallenges = new Map<string, HandshakeChallenge>();
  private readonly handshakeSessions = new Map<string, HandshakeSession>();
  private readonly handshakeDecisions = new Map<string, HandshakeDecision>();
  private readonly agentVisas = new Map<string, AgentVisa>();
  private readonly ingressGrants = new Map<string, IngressGrant>();
  private readonly externalAgentStandings = new Map<string, ExternalAgentStanding>();
  private readonly handshakeProofs = new Map<string, HandshakeProof>();
  private readonly proofsByDecisionId = new Map<string, string>();
  private readonly events: HandshakeEvent[] = [];

  // -- External agents --------------------------------------------------

  putExternalAgent(agent: ExternalAgentDescriptor): ExternalAgentDescriptor {
    this.externalAgents.set(agent.id, agent);
    return agent;
  }

  getExternalAgent(externalAgentId: string): ExternalAgentDescriptor | undefined {
    return this.externalAgents.get(externalAgentId);
  }

  // -- External trust issuers --------------------------------------------

  putExternalIssuer(issuer: ExternalTrustIssuer): ExternalTrustIssuer {
    this.externalIssuers.set(issuer.id, issuer);
    return issuer;
  }

  getExternalIssuer(externalIssuerId: string): ExternalTrustIssuer | undefined {
    return this.externalIssuers.get(externalIssuerId);
  }

  getExternalIssuersByTrustDomain(acceptedByTrustDomainId: string): readonly ExternalTrustIssuer[] {
    return [...this.externalIssuers.values()].filter((issuer) => issuer.acceptedByTrustDomainId === acceptedByTrustDomainId);
  }

  // -- Trust boundaries ---------------------------------------------------

  putTrustBoundary(boundary: TrustBoundary): TrustBoundary {
    this.trustBoundaries.set(boundary.id, boundary);
    return boundary;
  }

  getTrustBoundary(trustBoundaryId: string): TrustBoundary | undefined {
    return this.trustBoundaries.get(trustBoundaryId);
  }

  getTrustBoundariesByLocalTrustDomain(localTrustDomainId: string): readonly TrustBoundary[] {
    return [...this.trustBoundaries.values()].filter((boundary) => boundary.localTrustDomainId === localTrustDomainId);
  }

  // -- Passport presentations ----------------------------------------------

  putPassportPresentation(presentation: ExternalPassportPresentation): ExternalPassportPresentation {
    this.passportPresentations.set(presentation.id, presentation);
    return presentation;
  }

  getPassportPresentation(passportPresentationId: string): ExternalPassportPresentation | undefined {
    return this.passportPresentations.get(passportPresentationId);
  }

  // -- Authority presentations ---------------------------------------------

  putAuthorityPresentation(presentation: ExternalAuthorityPresentation): ExternalAuthorityPresentation {
    this.authorityPresentations.set(presentation.id, presentation);
    return presentation;
  }

  getAuthorityPresentation(authorityPresentationId: string): ExternalAuthorityPresentation | undefined {
    return this.authorityPresentations.get(authorityPresentationId);
  }

  // -- Capability requests --------------------------------------------------

  putCapabilityRequest(request: ExternalCapabilityRequest): ExternalCapabilityRequest {
    this.capabilityRequests.set(request.id, request);
    return request;
  }

  getCapabilityRequest(capabilityRequestId: string): ExternalCapabilityRequest | undefined {
    return this.capabilityRequests.get(capabilityRequestId);
  }

  getCapabilityRequestsByHandshakeRequest(handshakeRequestId: string): readonly ExternalCapabilityRequest[] {
    return [...this.capabilityRequests.values()].filter((request) => request.handshakeRequestId === handshakeRequestId);
  }

  // -- Handshake requests ---------------------------------------------------

  putHandshakeRequest(request: HandshakeRequest): HandshakeRequest {
    this.handshakeRequests.set(request.id, request);
    return request;
  }

  getHandshakeRequest(handshakeRequestId: string): HandshakeRequest | undefined {
    return this.handshakeRequests.get(handshakeRequestId);
  }

  queryHandshakeRequestsByExternalAgent(externalAgentId: string): readonly HandshakeRequest[] {
    return [...this.handshakeRequests.values()].filter((request) => request.externalAgent.id === externalAgentId);
  }

  queryHandshakeRequestsByTrustDomain(localTrustDomainId: string): readonly HandshakeRequest[] {
    return [...this.handshakeRequests.values()].filter((request) => request.localTrustDomainId === localTrustDomainId);
  }

  updateHandshakeRequestStatus(handshakeRequestId: string, status: HandshakeRequestStatus, patch: Partial<HandshakeRequest> = {}): HandshakeRequest {
    const existing = this.handshakeRequests.get(handshakeRequestId);
    if (!existing) {
      throw new HandshakeRequestNotFoundError(handshakeRequestId);
    }
    const updated: HandshakeRequest = { ...existing, ...patch, status };
    this.handshakeRequests.set(handshakeRequestId, updated);
    return updated;
  }

  // -- Handshake challenges -------------------------------------------------

  putHandshakeChallenge(challenge: HandshakeChallenge): HandshakeChallenge {
    this.handshakeChallenges.set(challenge.id, challenge);
    return challenge;
  }

  getHandshakeChallenge(handshakeChallengeId: string): HandshakeChallenge | undefined {
    return this.handshakeChallenges.get(handshakeChallengeId);
  }

  getHandshakeChallengeByRequestId(handshakeRequestId: string): HandshakeChallenge | undefined {
    return [...this.handshakeChallenges.values()].find((challenge) => challenge.handshakeRequestId === handshakeRequestId);
  }

  // -- Handshake sessions ----------------------------------------------------

  putHandshakeSession(session: HandshakeSession): HandshakeSession {
    this.handshakeSessions.set(session.id, session);
    return session;
  }

  getHandshakeSession(handshakeSessionId: string): HandshakeSession | undefined {
    return this.handshakeSessions.get(handshakeSessionId);
  }

  getHandshakeSessionByRequestId(handshakeRequestId: string): HandshakeSession | undefined {
    return [...this.handshakeSessions.values()].find((session) => session.handshakeRequestId === handshakeRequestId);
  }

  updateHandshakeSessionStatus(handshakeSessionId: string, status: HandshakeSessionStatus, patch: Partial<HandshakeSession> = {}): HandshakeSession {
    const existing = this.handshakeSessions.get(handshakeSessionId);
    if (!existing) {
      throw new HandshakeSessionNotFoundError(handshakeSessionId);
    }
    const updated: HandshakeSession = { ...existing, ...patch, status };
    this.handshakeSessions.set(handshakeSessionId, updated);
    return updated;
  }

  // -- Handshake decisions -----------------------------------------------------

  putHandshakeDecision(decision: HandshakeDecision): HandshakeDecision {
    this.handshakeDecisions.set(decision.id, decision);
    return decision;
  }

  getHandshakeDecision(handshakeDecisionId: string): HandshakeDecision | undefined {
    return this.handshakeDecisions.get(handshakeDecisionId);
  }

  // -- Agent visas ------------------------------------------------------------

  putAgentVisa(visa: AgentVisa): AgentVisa {
    this.agentVisas.set(visa.id, visa);
    return visa;
  }

  getAgentVisa(visaId: string): AgentVisa | undefined {
    return this.agentVisas.get(visaId);
  }

  queryActiveVisasByExternalAgent(externalAgentId: string): readonly AgentVisa[] {
    return [...this.agentVisas.values()].filter((visa) => visa.externalAgentId === externalAgentId && visa.status === 'active');
  }

  getLatestVisaForAgent(externalAgentId: string, localTrustDomainId: string): AgentVisa | undefined {
    return [...this.agentVisas.values()]
      .filter((visa) => visa.externalAgentId === externalAgentId && visa.localTrustDomainId === localTrustDomainId)
      .at(-1);
  }

  getLatestHandshakeRequestForAgent(externalAgentId: string, localTrustDomainId: string): HandshakeRequest | undefined {
    return this.queryHandshakeRequestsByExternalAgent(externalAgentId)
      .filter((request) => request.localTrustDomainId === localTrustDomainId)
      .at(-1);
  }

  updateAgentVisaStatus(visaId: string, status: AgentVisaStatus, patch: Partial<AgentVisa> = {}): AgentVisa {
    const existing = this.agentVisas.get(visaId);
    if (!existing) {
      throw new AgentVisaNotFoundError(visaId);
    }
    const updated: AgentVisa = { ...existing, ...patch, status };
    this.agentVisas.set(visaId, updated);
    return updated;
  }

  // -- Ingress grants --------------------------------------------------------

  putIngressGrant(grant: IngressGrant): IngressGrant {
    this.ingressGrants.set(grant.id, grant);
    return grant;
  }

  getIngressGrant(ingressGrantId: string): IngressGrant | undefined {
    return this.ingressGrants.get(ingressGrantId);
  }

  queryIngressGrantsByVisa(agentVisaId: string): readonly IngressGrant[] {
    return [...this.ingressGrants.values()].filter((grant) => grant.agentVisaId === agentVisaId);
  }

  updateIngressGrantStatus(ingressGrantId: string, status: IngressGrantStatus, patch: Partial<IngressGrant> = {}): IngressGrant {
    const existing = this.ingressGrants.get(ingressGrantId);
    if (!existing) {
      throw new IngressGrantNotFoundError(ingressGrantId);
    }
    const updated: IngressGrant = { ...existing, ...patch, status };
    this.ingressGrants.set(ingressGrantId, updated);
    return updated;
  }

  // -- External agent standings ------------------------------------------------

  putExternalAgentStanding(standing: ExternalAgentStanding): ExternalAgentStanding {
    this.externalAgentStandings.set(standing.id, standing);
    return standing;
  }

  getExternalAgentStanding(externalAgentStandingId: string): ExternalAgentStanding | undefined {
    return this.externalAgentStandings.get(externalAgentStandingId);
  }

  getLatestStandingForAgent(externalAgentId: string, localTrustDomainId: string): ExternalAgentStanding | undefined {
    const candidates = [...this.externalAgentStandings.values()].filter(
      (standing) => standing.externalAgentId === externalAgentId && standing.localTrustDomainId === localTrustDomainId,
    );
    return candidates.at(-1);
  }

  // -- Handshake proofs -----------------------------------------------------

  putHandshakeProof(proof: HandshakeProof): HandshakeProof {
    this.handshakeProofs.set(proof.id, proof);
    this.proofsByDecisionId.set(proof.handshakeDecisionId, proof.id);
    return proof;
  }

  getHandshakeProof(handshakeProofId: string): HandshakeProof | undefined {
    return this.handshakeProofs.get(handshakeProofId);
  }

  getHandshakeProofByDecisionId(handshakeDecisionId: string): HandshakeProof | undefined {
    const proofId = this.proofsByDecisionId.get(handshakeDecisionId);
    return proofId !== undefined ? this.handshakeProofs.get(proofId) : undefined;
  }

  getLastProof(): HandshakeProof | undefined {
    return [...this.handshakeProofs.values()].at(-1);
  }

  // -- Events -----------------------------------------------------------------

  putEvent(event: HandshakeEvent): HandshakeEvent {
    this.events.push(event);
    return event;
  }

  getLastEvent(): HandshakeEvent | undefined {
    return this.events.at(-1);
  }

  getAllEvents(): readonly HandshakeEvent[] {
    return [...this.events];
  }

  queryEventsByHandshakeRequest(handshakeRequestId: string): readonly HandshakeEvent[] {
    return this.events.filter((event) => event.handshakeRequestId === handshakeRequestId);
  }

  queryEventsByExternalAgent(externalAgentId: string): readonly HandshakeEvent[] {
    return this.events.filter((event) => event.externalAgentId === externalAgentId);
  }

  queryEventsByVisa(visaId: string): readonly HandshakeEvent[] {
    return this.events.filter((event) => event.visaId === visaId);
  }

  queryEventsByTrustDomain(localTrustDomainId: string): readonly HandshakeEvent[] {
    return this.events.filter((event) => event.localTrustDomainId === localTrustDomainId);
  }

  queryEventsByDecision(handshakeDecisionId: string): readonly HandshakeEvent[] {
    return this.events.filter((event) => event.handshakeDecisionId === handshakeDecisionId);
  }

  queryEventsByProof(handshakeProofId: string): readonly HandshakeEvent[] {
    return this.events.filter((event) => event.handshakeProofId === handshakeProofId);
  }
}
