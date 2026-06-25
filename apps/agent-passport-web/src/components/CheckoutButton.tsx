'use client';

interface CheckoutButtonProps {
  tierKey: string;
  label: string;
  className?: string;
}

export function CheckoutButton({ tierKey, label, className = 'btn btn-primary' }: CheckoutButtonProps) {
  async function handleClick() {
    const res = await fetch('/api/checkout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: tierKey }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || 'Checkout failed. Please try again.');
    }
  }

  return (
    <button className={className} onClick={handleClick}>
      {label}
    </button>
  );
}
