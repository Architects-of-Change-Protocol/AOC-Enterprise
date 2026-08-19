import * as React from 'react';
import type { PolicyDecisionRow, PolicyEvaluationRow, PolicyPackControlPlaneViewModel, PolicyPackRow, PolicyPackVersionRow, PolicyProofRow, PolicyRuleRow } from '../../domain/policy-pack-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';
import { PolicyPackSummaryCards } from './PolicyPackSummaryCards.js';
import { PolicyPacksTable } from './PolicyPacksTable.js';
import { PolicyPackVersionsTable } from './PolicyPackVersionsTable.js';
import { PolicyRulesTable } from './PolicyRulesTable.js';
import { PolicyEvaluationsTable } from './PolicyEvaluationsTable.js';
import { PolicyEventsTable } from './PolicyEventsTable.js';
import { PolicyDecisionDetail } from './PolicyDecisionDetail.js';
import { PolicyProofDetail } from './PolicyProofDetail.js';
import { PolicyEnforcementLinkPanel } from './PolicyEnforcementLinkPanel.js';
import { PolicyLegalCompletenessBadge } from './PolicyLegalCompletenessBadge.js';
import { PolicyDemoOnlyBadge } from './PolicyDemoOnlyBadge.js';

export interface PolicyPacksPanelProps {
  readonly policyPacks: PolicyPackControlPlaneViewModel;
}

const NOT_LEGAL_ADVICE = 'not_legal_advice';

/**
 * The Policy Packs section of the Soberanía Control Plane. Every table/detail here
 * reads directly from PolicyPackControlPlaneViewModel -- a projection over
 * Domain Policy Pack Runtime's own store/ledger via its control-plane
 * adapter, plus Action Enforcement's policy-referencing decision/proof
 * fields. This panel never evaluates a policy condition or rule, and never
 * shows a policy pack as legally complete beyond what its own
 * `legalCompleteness` metadata already states.
 */
export function PolicyPacksPanel({ policyPacks }: PolicyPacksPanelProps): React.ReactElement {
  const [selectedPack, setSelectedPack] = React.useState<PolicyPackRow | undefined>(undefined);
  const [selectedVersion, setSelectedVersion] = React.useState<PolicyPackVersionRow | undefined>(undefined);
  const [selectedRule, setSelectedRule] = React.useState<PolicyRuleRow | undefined>(undefined);
  const [selectedEvaluation, setSelectedEvaluation] = React.useState<PolicyEvaluationRow | undefined>(undefined);

  const hasAnyData = policyPacks.packs.length > 0 || policyPacks.evaluations.length > 0 || policyPacks.events.length > 0;

  const anyNotLegalAdvice = policyPacks.versions.some((version) => version.legalCompleteness === NOT_LEGAL_ADVICE) || policyPacks.packs.some((pack) => pack.legalCompleteness === NOT_LEGAL_ADVICE);
  const anyDemoOnly = policyPacks.versions.some((version) => version.demoOnly) || policyPacks.packs.some((pack) => pack.demoOnly);

  const selectedDecision: PolicyDecisionRow | undefined =
    selectedEvaluation !== undefined ? policyPacks.decisions.find((decision) => decision.id === selectedEvaluation.decisionId) : undefined;
  const selectedProof: PolicyProofRow | undefined =
    selectedEvaluation?.proofId !== undefined ? policyPacks.proofs.find((proof) => proof.id === selectedEvaluation.proofId) : undefined;

  const packVersions = selectedPack !== undefined ? policyPacks.versions.filter((version) => version.policyPackId === selectedPack.id) : policyPacks.versions;
  const versionRules = selectedVersion !== undefined ? policyPacks.rules.filter((rule) => rule.policyPackVersionId === selectedVersion.id) : policyPacks.rules;

  return (
    <section className="aoc-panel" aria-label="Policy Packs">
      <h2>Policy Packs</h2>

      <p className="aoc-policy-packs-panel__disclaimer">
        Policy pack decisions, proofs and events shown here are read verbatim from Domain Policy Pack Runtime. This panel displays policy evidence, not legal
        conclusions, and does not evaluate legal or regulatory compliance on its own.
      </p>
      {anyNotLegalAdvice ? <PolicyLegalCompletenessBadge legalCompleteness={NOT_LEGAL_ADVICE} /> : null}
      {anyDemoOnly ? <PolicyDemoOnlyBadge demoOnly={true} /> : null}

      {!hasAnyData ? (
        <AocEmptyState message="No Domain Policy Pack Runtime data is available for this Control Plane deployment." />
      ) : (
        <>
          <PolicyPackSummaryCards metrics={policyPacks.metrics} />

          <h3>Policy packs</h3>
          <PolicyPacksTable
            packs={policyPacks.packs}
            onSelect={(pack) => {
              setSelectedPack(pack);
              setSelectedVersion(undefined);
              setSelectedRule(undefined);
            }}
          />

          <h3>Policy pack versions</h3>
          <PolicyPackVersionsTable
            versions={packVersions}
            onSelect={(version) => {
              setSelectedVersion(version);
              setSelectedRule(undefined);
            }}
          />

          <h3>Policy rules</h3>
          <PolicyRulesTable rules={versionRules} onSelect={setSelectedRule} />
          {selectedRule !== undefined ? (
            <p className="aoc-policy-packs-panel__selected-rule">
              Selected rule: <strong>{selectedRule.name}</strong> ({selectedRule.id})
            </p>
          ) : null}

          <h3>Policy evaluations</h3>
          <PolicyEvaluationsTable evaluations={policyPacks.evaluations} onSelect={setSelectedEvaluation} />

          {selectedEvaluation !== undefined ? (
            <div className="aoc-policy-packs-panel__selected-evaluation">
              <h3>Selected evaluation: {selectedEvaluation.id}</h3>
              {selectedDecision !== undefined ? (
                <PolicyDecisionDetail decision={selectedDecision} />
              ) : (
                <AocEmptyState message="No policy decision found for this evaluation." />
              )}
              {selectedProof !== undefined ? (
                <PolicyProofDetail proof={selectedProof} />
              ) : (
                <AocEmptyState message="No policy proof found for this evaluation." />
              )}
            </div>
          ) : null}

          <h3>Policy events</h3>
          <PolicyEventsTable events={policyPacks.events} />

          <h3>Enforcement links</h3>
          {policyPacks.enforcementLinks.length === 0 ? (
            <AocEmptyState message="No enforcement decisions have referenced a policy pack decision yet." />
          ) : (
            <ul className="aoc-policy-packs-panel__enforcement-links">
              {policyPacks.enforcementLinks.map((link) => (
                <li key={link.id}>
                  <PolicyEnforcementLinkPanel link={link} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
