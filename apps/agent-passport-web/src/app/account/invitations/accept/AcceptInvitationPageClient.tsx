'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface InvitationPreview {
  invitationId: string;
  registryId: string;
  organizationName: string | null;
  invitedEmail: string;
  role: string;
  expiresAt: string;
}

export function AcceptInvitationPageClient() {
  const searchParams = useSearchParams();
  const invitationId = searchParams.get('invitation_id') ?? '';
  const token = searchParams.get('token') ?? '';

  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!invitationId || !token) {
      setError('Invalid invitation link.');
      setLoading(false);
      return;
    }
    fetch(`/api/team-invitations/${encodeURIComponent(invitationId)}?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setInvitation(data.data);
        else setError(data.error ?? 'Invalid invitation.');
      })
      .catch(() => setError('Failed to load invitation.'))
      .finally(() => setLoading(false));
  }, [invitationId, token]);

  async function handleAccept() {
    setAccepting(true);
    setError('');
    try {
      const res = await fetch('/api/team-invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id: invitationId, token }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (res.status === 401) {
          window.location.href = `/account/login?return=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return;
        }
        setError(data.error ?? 'Failed to accept invitation.');
        return;
      }
      setSuccess(true);
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setAccepting(false);
    }
  }

  if (loading) return <div className="container" style={{ paddingTop: 60 }}><p>Loading…</p></div>;

  if (success && invitation) {
    return (
      <div className="container" style={{ paddingTop: 60, maxWidth: 480 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>Invitation accepted</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 24 }}>
            You are now a <strong>{invitation.role}</strong> of{' '}
            {invitation.organizationName ?? invitation.registryId}.
          </p>
          <Link href="/account/dashboard" className="btn btn-primary">Go to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 60, paddingBottom: 80, maxWidth: 480 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div className="section-label">Team Invitation</div>
        <h1>Registry invitation</h1>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 24 }}>{error}</div>}

      {invitation && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
            {invitation.organizationName && (
              <div><span style={{ color: 'var(--text-muted)' }}>Organization:</span> {invitation.organizationName}</div>
            )}
            <div><span style={{ color: 'var(--text-muted)' }}>Registry:</span> <code>{invitation.registryId}</code></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Invited email:</span> {invitation.invitedEmail}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Role:</span> <span className="badge badge-active">{invitation.role}</span></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Expires:</span> {new Date(invitation.expiresAt).toLocaleDateString()}</div>
          </div>

          <div style={{ marginTop: 24 }}>
            <button className="btn btn-primary" onClick={handleAccept} disabled={accepting}>
              {accepting ? 'Accepting…' : 'Accept Invitation'}
            </button>
          </div>

          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            You must be signed in with <strong>{invitation.invitedEmail}</strong> to accept.{' '}
            <Link href="/account/login" style={{ color: 'var(--accent)' }}>
              Sign in
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
