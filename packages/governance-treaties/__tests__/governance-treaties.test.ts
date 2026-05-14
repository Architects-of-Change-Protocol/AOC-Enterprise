import { activateGovernanceTreaty, createGovernanceTreaty, disputeGovernanceTreaty, revokeGovernanceTreaty, suspendGovernanceTreaty } from '../governance-treaty';
import { addTreatyParticipant, validateTreatyParticipantEligibility } from '../treaty-participants';
import { createTreatyQuorumRule, evaluateTreatyQuorum } from '../treaty-quorum';
import { evaluateTreatyAuthority } from '../treaty-authority';
import { approveTreatyAmendment, applyTreatyAmendment, proposeTreatyAmendment } from '../treaty-amendments';
import { assignTreatyArbitrator, raiseTreatyDispute, resolveTreatyDispute } from '../treaty-disputes';
import { createTreatyAttestationRef, validateTreatyAttestationContinuity } from '../treaty-attestations';

const treatyBase = createGovernanceTreaty({ treatyId: 't1', treatyType: 'coalition', title: 'Coalition', participantRuntimeIds: ['r1', 'r2'], trustDomainRefs: ['td1'], authorityScopeRefs: ['a.read'], capabilityBoundaryRefs: ['cap1'], executionBoundaryRefs: ['exec1'], quorumRulesRef: 'q1', attestationRefs: ['att-core'] });
const p1 = { participantId: 'p1', treatyId: 't1', runtimeId: 'r1', participantRole: 'signatory' as const, votingWeight: 1, joinedAt: new Date().toISOString() };
const p2 = { participantId: 'p2', treatyId: 't1', runtimeId: 'r2', participantRole: 'arbitrator' as const, votingWeight: 1, joinedAt: new Date().toISOString() };

describe('governance treaties', () => {
  it('treaty lifecycle + revoked cannot reactivate', () => {
    const active = activateGovernanceTreaty(treatyBase);
    expect(active.status).toBe('active');
    const revoked = revokeGovernanceTreaty(active);
    expect(() => activateGovernanceTreaty(revoked)).toThrow(/revoked/);
  });

  it('participant eligibility', () => {
    expect(validateTreatyParticipantEligibility(treatyBase, 'r1')).toBe(true);
    expect(validateTreatyParticipantEligibility(treatyBase, 'rx')).toBe(false);
    expect(() => addTreatyParticipant(treatyBase, [], { ...p1, runtimeId: 'rx' })).toThrow();
  });

  it('quorum evaluation', () => {
    const rule = createTreatyQuorumRule({ quorumRuleId: 'q1', treatyId: 't1', minimumParticipants: 2, minimumVotingWeight: 2, requiredRoles: ['signatory'], emergencyOverrideAllowed: true, humanReviewRequired: false });
    const q = evaluateTreatyQuorum(rule, [p1, p2]);
    expect(q.satisfied).toBe(true);
  });

  it('authority blocked under disputed/suspended treaty', () => {
    const rule = createTreatyQuorumRule({ quorumRuleId: 'q1', treatyId: 't1', minimumParticipants: 1, minimumVotingWeight: 1, requiredRoles: [], emergencyOverrideAllowed: false, humanReviewRequired: false });
    const disputed = disputeGovernanceTreaty(activateGovernanceTreaty(treatyBase));
    const d = evaluateTreatyAuthority({ treaty: disputed, runtimeId: 'r1', requestedAuthorityRefs: ['a.read', 'a.write'], capabilityRef: 'cap1', executionRef: 'exec1', quorumRule: rule, participants: [p1], attestationRefs: ['att-core'], isAuthorityExpansion: true });
    expect(d.allowed).toBe(false);
    const suspended = suspendGovernanceTreaty(activateGovernanceTreaty(treatyBase));
    const s = evaluateTreatyAuthority({ treaty: suspended, runtimeId: 'r1', requestedAuthorityRefs: ['a.read'], capabilityRef: 'cap1', executionRef: 'exec1', quorumRule: rule, participants: [p1], attestationRefs: ['att-core'] });
    expect(s.allowed).toBe(false);
  });

  it('amendment quorum requirement', () => {
    const approved = approveTreatyAmendment(proposeTreatyAmendment({ amendmentId: 'a1', treatyId: 't1', proposedByRuntimeId: 'r1', amendmentType: 'expand_authority', proposedChanges: { authorityScopeRefs: ['a.write'] }, requiredQuorumRef: 'q1', attestationRefs: ['att-amend'] }));
    const strictRule = createTreatyQuorumRule({ quorumRuleId: 'q1', treatyId: 't1', minimumParticipants: 2, minimumVotingWeight: 2, requiredRoles: ['signatory', 'arbitrator'], emergencyOverrideAllowed: false, humanReviewRequired: false });
    const amended = applyTreatyAmendment(treatyBase, approved, strictRule, [p1, p2]);
    expect(amended.authorityScopeRefs).toContain('a.write');
  });

  it('dispute + arbitrator eligibility + resolution attestations', () => {
    const dispute = raiseTreatyDispute({ disputeId: 'd1', treatyId: 't1', raisedByRuntimeId: 'r1', disputeType: 'quorum_disagreement', affectedAuthorityRefs: ['a.read'], arbitratorRefs: [], attestationRefs: [] });
    expect(() => assignTreatyArbitrator(dispute, { ...p1, participantRole: 'observer' })).toThrow();
    const assigned = assignTreatyArbitrator(dispute, p2);
    expect(() => resolveTreatyDispute(assigned, [])).toThrow();
    expect(resolveTreatyDispute(assigned, ['att-dispute']).status).toBe('resolved');
  });

  it('treaty attestation continuity', () => {
    const refs = [
      createTreatyAttestationRef('t1', 'treaty_creation', 'ac'),
      createTreatyAttestationRef('t1', 'amendment', 'aa'),
      createTreatyAttestationRef('t1', 'dispute', 'ad'),
      createTreatyAttestationRef('t1', 'quorum', 'aq'),
      createTreatyAttestationRef('t1', 'authority_decision', 'au')
    ];
    expect(validateTreatyAttestationContinuity('t1', refs).continuous).toBe(true);
  });
});
