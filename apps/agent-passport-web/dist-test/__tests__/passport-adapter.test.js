"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const passport_adapter_js_1 = require("../src/lib/passport-adapter.js");
const agent_governance_1 = require("@aoc-enterprise/agent-governance");
const SAMPLE_INPUT = {
    agentName: 'TestAgent Alpha',
    ownerId: 'test-owner-1',
    ownerName: 'Test Owner Corp',
    purpose: 'Automated testing agent for AOC passport adapter.',
    jurisdiction: 'US',
    autonomyLevel: 'low',
    riskTier: 'low',
    dataAccess: ['test_data', 'public_docs'],
    tools: ['read_record', 'write_report'],
    prohibitedActions: ['delete_all', 'bypass_auth'],
    humanApprovalRequiredActions: [],
    escalationRules: [{ trigger: 'delete_all', action: 'block' }],
    createdBy: 'test-suite',
};
(0, node_test_1.describe)('passport-adapter', () => {
    let bundle;
    (0, node_test_1.before)(async () => {
        bundle = await (0, passport_adapter_js_1.enrollAgent)(SAMPLE_INPUT);
    });
    (0, node_test_1.it)('enrollment creates a passport bundle', () => {
        strict_1.default.ok(bundle.passport.passportId, 'passportId should be set');
        strict_1.default.equal(bundle.passport.agentName, SAMPLE_INPUT.agentName);
        strict_1.default.equal(bundle.passport.ownerName, SAMPLE_INPUT.ownerName);
        strict_1.default.ok(bundle.passport.constitutionHash, 'constitutionHash should be set');
        strict_1.default.ok(bundle.passport.policyManifestHash, 'policyManifestHash should be set');
        strict_1.default.ok(bundle.passport.passportHash, 'passportHash should be set');
        strict_1.default.ok(bundle.runtimeSeal, 'runtimeSeal should be present');
    });
    (0, node_test_1.it)('getAgentPassportBundle retrieves stored bundle', () => {
        const retrieved = (0, passport_adapter_js_1.getAgentPassportBundle)(bundle.passport.passportId);
        strict_1.default.ok(retrieved, 'should retrieve bundle');
        strict_1.default.equal(retrieved.passport.passportId, bundle.passport.passportId);
    });
    (0, node_test_1.it)('public verification payload hides sensitive metadata', () => {
        const publicPayload = (0, agent_governance_1.createAgentPassportPublicVerificationPayload)(bundle.passport);
        strict_1.default.ok(!('signature' in publicPayload), 'signature should not be in public payload');
        strict_1.default.ok(!('ownerId' in publicPayload), 'ownerId should not be in public payload');
        strict_1.default.ok(!('metadata' in publicPayload), 'metadata should not be in public payload');
        strict_1.default.ok(publicPayload.passportId, 'passportId should be present');
        strict_1.default.ok(publicPayload.passportHash, 'passportHash should be present');
    });
    (0, node_test_1.it)('verifyAgentPassportBundle returns valid for active/issued passport', async () => {
        const result = await (0, passport_adapter_js_1.verifyAgentPassportBundle)(bundle.passport.passportId);
        strict_1.default.ok(result, 'should return result');
        strict_1.default.equal(result.passportResult.valid, true, 'passport verification should be valid');
        if (result.runtimeSealResult) {
            strict_1.default.equal(result.runtimeSealResult.valid, true, 'runtime seal should be valid');
        }
    });
    (0, node_test_1.it)('verifyAgentPassportBundle returns null for unknown passport ID', async () => {
        const result = await (0, passport_adapter_js_1.verifyAgentPassportBundle)('AGT-NONEXISTENT-0000-0000');
        strict_1.default.equal(result, null);
    });
    (0, node_test_1.it)('createSampleAgentPassport creates SalesBot CR passport', async () => {
        const sample = await (0, passport_adapter_js_1.createSampleAgentPassport)();
        strict_1.default.equal(sample.passport.agentName, 'SalesBot CR');
        strict_1.default.equal(sample.passport.ownerName, 'AOC Demo Company');
        strict_1.default.equal(sample.passport.jurisdiction, 'CR');
        strict_1.default.equal(sample.passport.autonomyLevel, 'medium');
        strict_1.default.equal(sample.passport.riskTier, 'medium');
    });
    (0, node_test_1.it)('createSampleAgentPassport is idempotent (returns existing)', async () => {
        const a = await (0, passport_adapter_js_1.createSampleAgentPassport)();
        const b = await (0, passport_adapter_js_1.createSampleAgentPassport)();
        strict_1.default.equal(a.passport.passportId, b.passport.passportId, 'should return same passport');
    });
    (0, node_test_1.it)('runtime guard allows permitted action (create_lead)', async () => {
        const sample = await (0, passport_adapter_js_1.createSampleAgentPassport)();
        const decision = await (0, passport_adapter_js_1.runRuntimeGuardDemo)(sample.passport.passportId, 'create_lead', 'create_record', 'create_lead', ['crm_lead_notes']);
        strict_1.default.ok(decision, 'should return decision');
        // create_lead is in tools, so with humanOversight=required it requires human approval or allow
        // With allowIssuedPassport=true, it should not deny on passport status
        strict_1.default.notEqual(decision.outcome, 'deny', 'should not deny permitted action');
    });
    (0, node_test_1.it)('runtime guard denies prohibited action (offer_unapproved_discounts)', async () => {
        const sample = await (0, passport_adapter_js_1.createSampleAgentPassport)();
        const decision = await (0, passport_adapter_js_1.runRuntimeGuardDemo)(sample.passport.passportId, 'offer_unapproved_discounts', 'execute_tool', 'offer_unapproved_discounts', []);
        strict_1.default.ok(decision, 'should return decision');
        strict_1.default.equal(decision.outcome, 'deny', 'should deny prohibited action');
        strict_1.default.ok(decision.reasonCodes.includes('runtime_guard.action_prohibited'), 'should include action_prohibited reason code');
    });
    (0, node_test_1.it)('runtime guard returns null for unknown passport ID', async () => {
        const result = await (0, passport_adapter_js_1.runRuntimeGuardDemo)('AGT-NONEXISTENT-0000-0000', 'create_lead', 'create_record', 'create_lead', []);
        strict_1.default.equal(result, null);
    });
});
