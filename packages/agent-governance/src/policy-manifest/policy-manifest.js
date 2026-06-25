"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentPolicyManifest = createAgentPolicyManifest;
function createAgentPolicyManifest(input, passportId) {
    const auditLevel = input.riskTier === 'critical'
        ? 'enhanced'
        : input.riskTier === 'high'
            ? 'standard'
            : 'minimal';
    const retentionDays = input.riskTier === 'critical' ? 2555 : input.riskTier === 'high' ? 365 : 90;
    const humanApprovalRequiredFor = input.humanOversight.requirement === 'required' ? [...input.tools] : [];
    return {
        manifestId: `MANIFEST-${passportId}`,
        passportId,
        version: '1.0',
        allowedActions: [...input.tools],
        prohibitedActions: [...input.prohibitedActions],
        dataAccess: [...input.dataAccess],
        toolAccess: [...input.tools],
        humanApprovalRequiredFor,
        riskTier: input.riskTier,
        autonomyLevel: input.autonomyLevel,
        audit: {
            required: true,
            retentionDays,
            level: auditLevel,
        },
        createdAt: input.issuedAt,
    };
}
