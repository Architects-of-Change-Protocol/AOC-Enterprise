"use strict";
/**
 * Adapter layer between the web app and @aoc-enterprise/agent-governance.
 * All passport logic stays in the core package; this file only wires dependencies.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrollAgent = enrollAgent;
exports.getAgentPassportBundle = getAgentPassportBundle;
exports.verifyAgentPassportBundle = verifyAgentPassportBundle;
exports.runRuntimeGuardDemo = runRuntimeGuardDemo;
exports.createSampleAgentPassport = createSampleAgentPassport;
const agent_governance_1 = require("@aoc-enterprise/agent-governance");
const dev_signer_js_1 = require("./dev-signer.js");
const store_js_1 = require("./store.js");
const BASE_VERIFICATION_URL = process.env.NEXT_PUBLIC_BASE_URL
    ? `${process.env.NEXT_PUBLIC_BASE_URL}/verify`
    : 'http://localhost:3000/verify';
async function enrollAgent(input) {
    const signer = (0, dev_signer_js_1.createDevSigner)();
    const hasHumanApproval = input.humanApprovalRequiredActions.length > 0;
    const enrollmentInput = {
        agentName: input.agentName,
        ownerId: input.ownerId,
        ownerName: input.ownerName,
        purpose: input.purpose,
        jurisdiction: input.jurisdiction,
        autonomyLevel: input.autonomyLevel,
        riskTier: input.riskTier,
        dataAccess: input.dataAccess,
        tools: input.tools,
        prohibitedActions: input.prohibitedActions,
        humanOversight: {
            requirement: hasHumanApproval ? 'required' : 'optional',
            description: hasHumanApproval
                ? `Human approval required for: ${input.humanApprovalRequiredActions.join(', ')}`
                : undefined,
        },
        escalationRules: input.escalationRules.map((r) => ({
            trigger: r.trigger,
            action: r.action,
        })),
        createdBy: input.createdBy,
        issuedAt: new Date().toISOString(),
        modelProvider: input.modelProvider,
        runtimeEnvironment: input.runtimeEnvironment,
        tags: input.tags,
    };
    const bundle = await (0, agent_governance_1.issueAgentPassport)(enrollmentInput, {
        signer,
        baseVerificationUrl: BASE_VERIFICATION_URL,
        issuer: 'AOC-Dev-Governance-Authority',
    });
    (0, store_js_1.storePassportBundle)(bundle);
    return bundle;
}
function getAgentPassportBundle(passportId) {
    return (0, store_js_1.getPassportBundle)(passportId);
}
async function verifyAgentPassportBundle(passportId) {
    const bundle = (0, store_js_1.getPassportBundle)(passportId);
    if (!bundle)
        return null;
    const signer = (0, dev_signer_js_1.createDevSigner)();
    const passportResult = await (0, agent_governance_1.verifyAgentPassport)(bundle.passport, { signer });
    let runtimeSealResult = null;
    if (bundle.runtimeSeal) {
        // allowIssued: true because newly enrolled passports have status 'issued' until activated.
        runtimeSealResult = await (0, agent_governance_1.verifyAgentRuntimeSeal)(bundle.runtimeSeal, bundle.passport, { signer }, { allowIssued: true });
    }
    const publicPayload = (0, agent_governance_1.createAgentPassportPublicVerificationPayload)(bundle.passport);
    return { passportResult, runtimeSealResult, publicPayload };
}
async function runRuntimeGuardDemo(passportId, requestedAction, actionCategory, toolName, dataCategories) {
    const bundle = (0, store_js_1.getPassportBundle)(passportId);
    if (!bundle)
        return null;
    const signer = (0, dev_signer_js_1.createDevSigner)();
    const input = {
        request: {
            requestId: `demo-${Date.now()}`,
            passportId,
            actorId: bundle.passport.ownerId,
            requestedAction,
            actionCategory,
            toolName,
            dataCategories,
            requestedAt: new Date().toISOString(),
        },
        passport: bundle.passport,
        runtimeSeal: bundle.runtimeSeal,
        policyManifest: bundle.policyManifest,
        options: {
            allowIssuedPassport: true,
        },
    };
    return (0, agent_governance_1.evaluateAgentRuntimeGuard)(input, { signer });
}
// Module-level cache for the sample passport — immune to user-enrolled agents with the same name.
let _samplePassportBundle;
async function createSampleAgentPassport() {
    if (_samplePassportBundle)
        return _samplePassportBundle;
    const bundle = await enrollAgent({
        agentName: 'SalesBot CR',
        ownerId: 'aoc-demo-company',
        ownerName: 'AOC Demo Company',
        purpose: 'Assist with sales conversations and CRM lead capture under human-supervised governance.',
        jurisdiction: 'CR',
        autonomyLevel: 'medium',
        riskTier: 'medium',
        dataAccess: ['product_catalog', 'approved_faq', 'crm_lead_notes'],
        tools: ['create_lead', 'classify_intent', 'draft_response'],
        prohibitedActions: [
            'offer_unapproved_discounts',
            'make_legal_claims',
            'access_payment_data',
            'delete_customer_records',
        ],
        humanApprovalRequiredActions: [
            'discount_above_10_percent',
            'contract_language',
            'refund_commitment',
            'customer_escalation',
        ],
        escalationRules: [
            { trigger: 'contract_language', action: 'escalate_to_legal' },
            { trigger: 'refund_commitment', action: 'escalate_to_finance' },
        ],
        createdBy: 'aoc-demo-setup',
        modelProvider: 'AOC-Compatible-LLM',
        runtimeEnvironment: 'production',
        tags: ['sales', 'crm', 'demo'],
    });
    _samplePassportBundle = bundle;
    return bundle;
}
