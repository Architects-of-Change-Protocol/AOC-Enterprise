import { Suspense } from 'react';
import { LoginPageClient } from './LoginPageClient';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageClient />
    </Suspense>
  );
}

function LoginPageFallback() {
  return (
    <div className="container" style={{ paddingTop: 60, paddingBottom: 80, maxWidth: 480 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div className="section-label">Buyer Account</div>
        <h1>Sign in to your Soberanía buyer account</h1>
      </div>
      <div className="card">
        <p style={{ color: 'var(--text-muted)' }}>Loading sign in…</p>
      </div>
    </div>
  );
}
