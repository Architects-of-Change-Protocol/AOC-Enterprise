export interface Purchase {
  sessionId: string;
  tier: string;
  status: 'pending' | 'complete';
  createdAt: string;
  completedAt?: string;
}

const purchases = new Map<string, Purchase>();

export function createPendingPurchase(tier: string): Purchase {
  const sessionId = `mvp-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const purchase: Purchase = {
    sessionId,
    tier,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  purchases.set(sessionId, purchase);
  return purchase;
}

export function markPurchaseComplete(sessionId: string, tier: string): Purchase {
  const existing = purchases.get(sessionId);
  if (existing) {
    existing.status = 'complete';
    existing.completedAt = new Date().toISOString();
    return existing;
  }
  const purchase: Purchase = {
    sessionId,
    tier,
    status: 'complete',
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
  purchases.set(sessionId, purchase);
  return purchase;
}

export function getPurchase(sessionId: string): Purchase | undefined {
  return purchases.get(sessionId);
}

export function canEnrollWithPurchase(sessionId: string): boolean {
  const purchase = purchases.get(sessionId);
  return purchase?.status === 'complete';
}
