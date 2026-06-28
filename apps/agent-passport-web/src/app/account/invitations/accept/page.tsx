import { Suspense } from 'react';
import { AcceptInvitationPageClient } from './AcceptInvitationPageClient';

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<AcceptInvitationPageFallback />}>
      <AcceptInvitationPageClient />
    </Suspense>
  );
}

function AcceptInvitationPageFallback() {
  return (
    <div className="container" style={{ paddingTop: 60, paddingBottom: 80, maxWidth: 480 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div className="section-label">Team Invitation</div>
        <h1>Registry invitation</h1>
      </div>
      <div className="card">
        <p style={{ color: 'var(--text-muted)' }}>Loading invitation…</p>
      </div>
    </div>
  );
}
