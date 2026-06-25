'use client';

import { AgentPassportTier } from '@/lib/pricing';

interface PricingCardProps {
  tier: AgentPassportTier;
}

export function PricingCard({ tier }: PricingCardProps) {
  async function handleCheckout() {
    if (tier.key === 'organization_agent_registry') {
      window.location.href = '/organization-registry/start';
      return;
    }

    const res = await fetch('/api/checkout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: tier.key }),
    });
    const data = await res.json() as { url?: string; error?: string };
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error ?? 'Checkout failed. Please try again.');
    }
  }

  return (
    <div className={`card pricing-card${tier.recommended ? ' pricing-card-recommended' : ''}`}>
      {tier.recommended && (
        <div className="pricing-badge-recommended">Recommended</div>
      )}
      <div className="pricing-name">{tier.name}</div>
      <div className="pricing-price">
        <span className="pricing-amount">{tier.priceLabel}</span>
        <span className="pricing-billing"> / {tier.billingLabel}</span>
      </div>
      <p className="pricing-description">{tier.description}</p>
      <ul className="pricing-features">
        {tier.features.map(f => (
          <li key={f}><span className="pricing-check">✓</span> {f}</li>
        ))}
      </ul>
      <button className={`btn ${tier.recommended ? 'btn-primary' : 'btn-secondary'} pricing-cta`} onClick={handleCheckout}>
        {tier.ctaLabel}
      </button>
    </div>
  );
}
