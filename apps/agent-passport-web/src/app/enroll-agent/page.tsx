import { enrollAgentAction } from './actions';

export const metadata = {
  title: 'Enroll Agent — AOC Agent Passport',
};

export default function EnrollAgentPage() {
  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div className="page-header">
        <div className="section-label">Step 1</div>
        <h1>Enroll an AI Agent</h1>
        <p>
          Define the agent's identity, authority limits, data access, and human oversight
          requirements. A signed passport and constitution will be generated on submission.
        </p>
      </div>

      <div className="alert alert-warning">
        MVP build — passport stored in-memory only. Data is lost on server restart.
      </div>

      <form action={enrollAgentAction} style={{ display: 'grid', gap: 32 }}>

        {/* Identity */}
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Agent Identity</h2>
          <div className="form-grid form-grid-2">
            <div className="field">
              <label htmlFor="agentName">Agent Name *</label>
              <input id="agentName" name="agentName" required placeholder="e.g. SalesBot CR" />
            </div>
            <div className="field">
              <label htmlFor="ownerName">Owner Name *</label>
              <input id="ownerName" name="ownerName" required placeholder="e.g. Acme Corp" />
            </div>
            <div className="field">
              <label htmlFor="ownerId">Owner ID *</label>
              <input id="ownerId" name="ownerId" required placeholder="e.g. acme-corp" />
            </div>
            <div className="field">
              <label htmlFor="jurisdiction">Jurisdiction / Region</label>
              <input id="jurisdiction" name="jurisdiction" placeholder="e.g. US, CR, EU, GLOBAL" defaultValue="GLOBAL" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="purpose">Purpose *</label>
              <textarea id="purpose" name="purpose" required placeholder="Describe the agent's purpose and function..." />
            </div>
          </div>
        </div>

        {/* Governance */}
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Governance Parameters</h2>
          <div className="form-grid form-grid-2">
            <div className="field">
              <label htmlFor="autonomyLevel">Autonomy Level *</label>
              <select id="autonomyLevel" name="autonomyLevel" required defaultValue="medium">
                <option value="low">Low — Human review for most actions</option>
                <option value="medium">Medium — Human review for key actions</option>
                <option value="high">High — Mostly autonomous</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="riskTier">Risk Tier *</label>
              <select id="riskTier" name="riskTier" required defaultValue="medium">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical — Human approval for all tool use</option>
              </select>
            </div>
          </div>
        </div>

        {/* Access */}
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Access &amp; Tools</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="dataAccess">Data Access</label>
              <textarea id="dataAccess" name="dataAccess" placeholder="product_catalog&#10;approved_faq&#10;crm_lead_notes" />
              <span className="field-hint">One per line or comma-separated</span>
            </div>
            <div className="field">
              <label htmlFor="toolAccess">Tool Access</label>
              <textarea id="toolAccess" name="toolAccess" placeholder="create_lead&#10;classify_intent&#10;draft_response" />
              <span className="field-hint">One per line or comma-separated</span>
            </div>
          </div>
        </div>

        {/* Limits */}
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Limits &amp; Oversight</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="prohibitedActions">Prohibited Actions</label>
              <textarea id="prohibitedActions" name="prohibitedActions" placeholder="offer_unapproved_discounts&#10;make_legal_claims&#10;access_payment_data" />
              <span className="field-hint">One per line or comma-separated</span>
            </div>
            <div className="field">
              <label htmlFor="humanApprovalRequired">Human Approval Required For</label>
              <textarea id="humanApprovalRequired" name="humanApprovalRequired" placeholder="discount_above_10_percent&#10;contract_language&#10;refund_commitment" />
              <span className="field-hint">One per line or comma-separated. If any actions listed, oversight is set to required.</span>
            </div>
            <div className="field">
              <label htmlFor="escalationRules">Escalation Rules</label>
              <textarea id="escalationRules" name="escalationRules" placeholder="contract_language -> escalate_to_legal&#10;refund_commitment -> escalate_to_finance" />
              <span className="field-hint">Format: trigger -&gt; action, one per line</span>
            </div>
          </div>
        </div>

        {/* Runtime */}
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Runtime &amp; Provenance</h2>
          <div className="form-grid form-grid-2">
            <div className="field">
              <label htmlFor="createdBy">Created By</label>
              <input id="createdBy" name="createdBy" placeholder="e.g. admin@acme.com" />
            </div>
            <div className="field">
              <label htmlFor="modelProvider">Model Provider</label>
              <input id="modelProvider" name="modelProvider" placeholder="e.g. OpenAI, Anthropic" />
            </div>
            <div className="field">
              <label htmlFor="runtimeEnvironment">Runtime Environment</label>
              <input id="runtimeEnvironment" name="runtimeEnvironment" placeholder="e.g. production, staging" />
            </div>
            <div className="field">
              <label htmlFor="tags">Tags</label>
              <input id="tags" name="tags" placeholder="sales, crm, customer-facing" />
              <span className="field-hint">Comma-separated</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn-primary">
            Issue Agent Passport →
          </button>
          <a href="/agent-passport" className="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>
  );
}
