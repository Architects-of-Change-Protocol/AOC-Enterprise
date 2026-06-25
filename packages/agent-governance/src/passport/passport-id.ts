import { randomBytes } from 'crypto';

export type AgentPassportId = string;

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const PASSPORT_ID_REGEX = /^AOC-AGT-\d{4}-[A-Z0-9]{1,12}-[A-Z0-9]{6}$/;

function generateEntropy(length: number): string {
  const bytes = randomBytes(length * 4);
  let result = '';
  for (let i = 0; i < bytes.length && result.length < length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    const idx = byte % CHARS.length;
    result += CHARS[idx];
  }
  return result;
}

export interface GenerateAgentPassportIdOptions {
  readonly issuedAt: string;
  readonly region?: string;
  readonly entropy?: string;
}

export function generateAgentPassportId(
  options: GenerateAgentPassportIdOptions,
): AgentPassportId {
  const parsedDate = new Date(options.issuedAt);
  if (isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid issuedAt date: ${options.issuedAt}`);
  }
  const year = parsedDate.getUTCFullYear();
  const rawRegion = options.region ?? 'GLOBAL';
  const region = rawRegion
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12) || 'GLOBAL';
  const entropy = options.entropy ?? generateEntropy(6);
  return `AOC-AGT-${year}-${region}-${entropy}`;
}

export function isValidAgentPassportId(value: string): boolean {
  return PASSPORT_ID_REGEX.test(value);
}
