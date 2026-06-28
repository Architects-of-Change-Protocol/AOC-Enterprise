import { Suspense } from 'react';
import { SignupPageClient } from './SignupPageClient';

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupPageFallback />}>
      <SignupPageClient />
    </Suspense>
  );
}

function SignupPageFallback() {
  return (
    <div className="container" style={{ paddingTop: 60, paddingBottom: 80, maxWidth: 480 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div className="section-label">Buyer Account</div>
        <h1>Create your AOC buyer account</h1>
      </div>
      <div className="card">
        <p style={{ color: 'var(--text-muted)' }}>Loading sign up…</p>
      </div>
    </div>
  );
}
