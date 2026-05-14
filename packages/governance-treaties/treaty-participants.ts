import { GovernanceTreaty, TreatyParticipant } from './types';

export function validateTreatyParticipantEligibility(treaty: GovernanceTreaty, runtimeId: string): boolean {
  return treaty.participantRuntimeIds.includes(runtimeId);
}

export function addTreatyParticipant(treaty: GovernanceTreaty, participants: TreatyParticipant[], participant: TreatyParticipant): TreatyParticipant[] {
  if (!validateTreatyParticipantEligibility(treaty, participant.runtimeId)) throw new Error('participant runtime must be included in treaty participants');
  return [...participants, participant];
}

export const suspendTreatyParticipant = (participant: TreatyParticipant): TreatyParticipant => ({ ...participant, suspendedAt: new Date().toISOString() });
export const exitTreatyParticipant = (participant: TreatyParticipant): TreatyParticipant => ({ ...participant, exitedAt: new Date().toISOString() });
export const listTreatyParticipants = (participants: TreatyParticipant[], treatyId: string): TreatyParticipant[] => participants.filter((p) => p.treatyId === treatyId);
