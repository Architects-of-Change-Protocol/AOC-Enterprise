import type { PMFreakAgentPassport, PMFreakAgentPassportRegistry, PMFreakAgentRole } from './pmfreak-agent-passport-types.js';

/**
 * Builds an in-memory PMFreak agent passport registry. Deterministic, no
 * mutation, no network calls -- the registry never derives a passport it
 * was not given, and never mutates the passports passed to it.
 */
export function createPMFreakAgentPassportRegistry(passports: readonly PMFreakAgentPassport[]): PMFreakAgentPassportRegistry {
  const byPassportId = new Map<string, PMFreakAgentPassport>(passports.map((passport) => [passport.passportId, passport]));

  return {
    passports,
    findByPassportId(passportId: string): PMFreakAgentPassport | undefined {
      return byPassportId.get(passportId);
    },
    findByAgentId(agentId: string): readonly PMFreakAgentPassport[] {
      return passports.filter((passport) => passport.agentId === agentId);
    },
    findActiveByAgentId(agentId: string): readonly PMFreakAgentPassport[] {
      return passports.filter((passport) => passport.agentId === agentId && passport.status === 'active');
    },
    findByRole(role: PMFreakAgentRole): readonly PMFreakAgentPassport[] {
      return passports.filter((passport) => passport.role === role);
    },
  };
}
