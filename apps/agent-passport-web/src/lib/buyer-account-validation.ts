export function normalizeBuyerEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 200);
}

export function validateBuyerEmail(email: string): boolean {
  if (!email || email.length > 200) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeDisplayName(name: unknown): string | null {
  if (name === null || name === undefined || name === '') return null;
  if (typeof name !== 'string') return null;
  // Remove control characters
  const cleaned = name.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 120);
}
