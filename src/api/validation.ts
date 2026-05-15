const ID_RE = /^[a-zA-Z0-9_-]{6,128}$/;

export function parsePagination(url: URL, defaultLimit = 50, maxLimit = 100) {
  const limitRaw = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = limitRaw ? Number(limitRaw) : defaultLimit;
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("limit must be a positive integer");
  return { limit: Math.min(limit, maxLimit), cursor };
}

export function requireId(name: string, value: unknown) {
  if (typeof value !== "string" || !ID_RE.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

export function optionalDate(name: string, value: unknown) {
  if (value == null) return undefined;
  const s = String(value);
  if (Number.isNaN(Date.parse(s))) throw new Error(`${name} must be an ISO date`);
  return s;
}
