import Link from 'next/link';

export const metadata = {
  title: 'Checkout Canceled — AOC Agent Passport',
};

export default function CheckoutCancelPage() {
  return (
    <div>
      <section className="section" style={{ paddingTop: 80 }}>
        <div className="container" style={{ maxWidth: 600, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 24px' }}>
            ×
          </div>
          <div className="section-label">Canceled</div>
          <h1 style={{ fontSize: 28, marginBottom: 16 }}>Checkout was canceled.</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: 40 }}>
            No payment was completed. You can return to pricing to review your options or view a sample
            passport to learn more about the product.
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <Link href="/pricing" className="btn btn-primary">
              Return to Pricing
            </Link>
            <Link href="/sample-passport" className="btn btn-secondary">
              View Sample Passport
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
