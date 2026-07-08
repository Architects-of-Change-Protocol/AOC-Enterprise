import { POLICY_PACK_PROHIBITED_OVERCLAIM_PHRASES, POLICY_PACK_SAFE_LABELS } from '../manifest/policy-pack-manifest-constants.js';

export interface PolicyPackClaimSafetyResult {
  readonly safe: boolean;
  readonly prohibitedPhrasesFound: readonly string[];
  readonly warnings: readonly string[];
}

export interface PolicyPackClaimSafetyOptions {
  readonly allowedSourceProvidedClaims?: readonly string[];
  readonly stripSafeDisclaimers?: boolean;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every safe label rendered as the natural-language text it is likely to appear as in prose (spaces and hyphens, not just underscores). */
const SAFE_LABEL_TEXT_PATTERNS: readonly RegExp[] = POLICY_PACK_SAFE_LABELS.flatMap((label) => {
  const natural = label.replace(/_/g, ' ');
  const hyphenated = label.replace(/_/g, '-');
  return [new RegExp(escapeRegExp(label), 'g'), new RegExp(escapeRegExp(natural), 'g'), new RegExp(escapeRegExp(hyphenated), 'g')];
});

/**
 * A prohibited phrase preceded by a negation ("not", "no", "never", "isn't",
 * "does not claim/constitute/provide/guarantee [to be]") is a safe
 * disclaimer, not an overclaim -- e.g. "not GDPR compliant" or "does not
 * claim to be HIPAA compliant" must never be flagged. This mirrors the exact
 * false-positive bug the AOC Jurisdiction Pack Runtime work already found
 * for "not legal advice", generalized to every prohibited phrase.
 */
const NEGATED_PROHIBITED_PHRASE_PATTERNS: readonly RegExp[] = POLICY_PACK_PROHIBITED_OVERCLAIM_PHRASES.map((phrase) => {
  const escaped = escapeRegExp(phrase.toLowerCase());
  return new RegExp(`\\b(?:not|no|never|isn't|is not|without)\\s+(?:a\\s+|an\\s+)?${escaped}|\\b(?:does not|doesn't)\\s+(?:constitute|provide|claim|guarantee)(?:\\s+to be)?\\s+(?:a\\s+|an\\s+)?${escaped}`, 'g');
});

function stringifyForScan(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

function stripSafeDisclaimerText(text: string): string {
  let sanitized = text;
  for (const pattern of NEGATED_PROHIBITED_PHRASE_PATTERNS) sanitized = sanitized.replace(pattern, ' ');
  for (const pattern of SAFE_LABEL_TEXT_PATTERNS) sanitized = sanitized.replace(pattern, ' ');
  return sanitized;
}

/**
 * Domain-agnostic claim-safety evaluator. Applies to every AOC policy pack
 * kind -- legal, security, privacy, healthcare, finance, AI governance,
 * project governance -- not just legal packs. Never calls a network or a
 * language model, and never scans a document image or PDF; this is a pure
 * deterministic string scan.
 */
export function evaluatePolicyPackClaimSafety(value: unknown, options?: PolicyPackClaimSafetyOptions): PolicyPackClaimSafetyResult {
  const stripSafeDisclaimers = options?.stripSafeDisclaimers ?? true;
  const allowedSourceProvidedClaims = new Set((options?.allowedSourceProvidedClaims ?? []).map((claim) => claim.toLowerCase()));

  const normalized = stringifyForScan(value).toLowerCase();
  const scanText = stripSafeDisclaimers ? stripSafeDisclaimerText(normalized) : normalized;

  const prohibitedPhrasesFound: string[] = [];
  const warnings: string[] = [];

  for (const phrase of POLICY_PACK_PROHIBITED_OVERCLAIM_PHRASES) {
    const lowerPhrase = phrase.toLowerCase();
    if (!scanText.includes(lowerPhrase)) continue;

    if (allowedSourceProvidedClaims.has(lowerPhrase)) {
      warnings.push(`"${phrase}" is present as an explicitly allowed source-provided claim; it must be labeled as source-provided, not as AOC's own conclusion.`);
      continue;
    }

    prohibitedPhrasesFound.push(phrase);
  }

  return { safe: prohibitedPhrasesFound.length === 0, prohibitedPhrasesFound, warnings };
}
