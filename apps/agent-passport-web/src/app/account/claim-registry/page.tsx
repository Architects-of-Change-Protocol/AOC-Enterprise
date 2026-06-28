import { Suspense } from 'react';
import { ClaimRegistryPageClient } from './ClaimRegistryPageClient';

export default function ClaimRegistryPage() {
  return (
    <Suspense fallback={<ClaimRegistryPageFallback />}>
      <ClaimRegistryPageClient />
    </Suspense>
  );
}

function ClaimRegistryPageFallback() {
  return (
    <div className="container" style={{ paddingTop: 60, paddingBottom: 80, maxWidth: 480 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div className="section-label">Buyer Account</div>
        <h1>Claim an existing registry</h1>
      </div>
      <div className="card">
        <p style={{ color: 'var(--text-muted)' }}>Loading registry claim…</p>
      </div>
    </div>
  );
}
