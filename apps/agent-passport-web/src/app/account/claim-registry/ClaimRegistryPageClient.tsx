'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function ClaimRegistryPageClient() {
  const searchParams = useSearchParams();
  const [registryId, setRegistryId] = useState(searchParams.get('registry_id') ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ role: string; registryId: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/account/claim-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registry_id: registryId, access_token: accessToken }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (res.status === 401) {
          window.location.href = `/account/login?return=/account/claim-registry?registry_id=${encodeURIComponent(registryId)}`;
          return;
        }
        setError(data.error ?? 'Claim failed.');
        return;
      }
      setSuccess({ role: data.data.role, registryId: data.data.registryId });
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="container" style={{ paddingTop: 60, paddingBottom: 80, maxWidth: 480 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 12 }}>Registry claimed</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
            You are now an <strong>{success.role}</strong> of registry <code>{success.registryId}</code>.
          </p>
          <Link href="/account/dashboard" className="btn btn-primary">Go to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 60, paddingBottom: 80, maxWidth: 480 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div className="section-label">Buyer Account</div>
        <h1>Claim an existing registry</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Link your Soberanía buyer account to an existing Organization Agent Registry using your admin access token.
        </p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="form-label">Registry ID</label>
              <input
                className="form-input"
                type="text"
                value={registryId}
                onChange={e => setRegistryId(e.target.value)}
                required
                placeholder="reg_..."
              />
            </div>
            <div>
              <label className="form-label">Admin Access Token</label>
              <input
                className="form-input"
                type="password"
                value={accessToken}
                onChange={e => setAccessToken(e.target.value)}
                required
                placeholder="Your registry admin access token"
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Claiming…' : 'Claim Registry'}
            </button>
          </div>
        </form>
      </div>

      <p style={{ marginTop: 24, color: 'var(--text-muted)', fontSize: 14 }}>
        <Link href="/account/dashboard" style={{ color: 'var(--accent)' }}>← Back to dashboard</Link>
      </p>
    </div>
  );
}
