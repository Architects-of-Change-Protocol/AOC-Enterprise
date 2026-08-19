'use client';

import { useState } from 'react';
import Link from 'next/link';

type Mode = 'recovery_code' | 'checkout_session';

interface RecoveryResult {
  registryId: string;
  adminUrl: string;
  newAccessToken: string;
  newRecoveryCode: string;
  rotatedAt: string;
}

export default function RegistryRecoverPage() {
  const [mode, setMode] = useState<Mode>('recovery_code');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecoveryResult | null>(null);

  const [recoveryForm, setRecoveryForm] = useState({
    registry_id: '',
    buyer_contact_email: '',
    recovery_code: '',
  });

  const [sessionForm, setSessionForm] = useState({
    session_id: '',
    buyer_contact_email: '',
  });

  function handleRecoveryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRecoveryForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleSessionChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSessionForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const body = mode === 'recovery_code'
        ? { mode, ...recoveryForm }
        : { mode, ...sessionForm };

      const res = await fetch('/api/organization-registry/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; data?: RecoveryResult; error?: string; code?: string };

      if (data.ok && data.data) {
        setResult(data.data);
      } else {
        setError(data.error ?? 'Recovery failed. Please check your details and try again.');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="container" style={{ maxWidth: 600, paddingTop: 60, paddingBottom: 80 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 0 24px' }}>
          ✓
        </div>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Access Recovered</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
          Your admin access has been rotated. Save your new admin URL and recovery code securely.
        </p>

        <div className="alert alert-warning" style={{ marginBottom: 24 }}>
          <strong>Save these now.</strong> Your new recovery code is shown only once and cannot be retrieved again.
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Admin URL</div>
            <div className="mono-block" style={{ fontSize: 12, wordBreak: 'break-all' }}>{result.adminUrl}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Recovery Code</div>
            <div className="mono-block" style={{ fontSize: 14, letterSpacing: '0.1em', fontWeight: 700 }}>{result.newRecoveryCode}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <a href={result.adminUrl} className="btn btn-primary">Open Registry Admin →</a>
          <Link href="/pricing" className="btn btn-secondary">Back to Pricing</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 560, paddingTop: 60, paddingBottom: 80 }}>
      <div className="section-label">Organization Registry</div>
      <h1 style={{ fontSize: 26, marginBottom: 12 }}>Recover Organization Registry Access</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
        Use your registry recovery code or verified checkout session to rotate your admin access link.
      </p>

      {error && (
        <div className="alert alert-warning" style={{ marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        <button
          className={`btn ${mode === 'recovery_code' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setMode('recovery_code')}
          style={{ flex: 1 }}
        >
          Use Recovery Code
        </button>
        <button
          className={`btn ${mode === 'checkout_session' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setMode('checkout_session')}
          style={{ flex: 1 }}
        >
          Use Checkout Session
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === 'recovery_code' ? (
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Recovery Code</h2>
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label className="form-label">Registry ID</label>
              <input
                className="form-input"
                type="text"
                name="registry_id"
                value={recoveryForm.registry_id}
                onChange={handleRecoveryChange}
                placeholder="registry_..."
                required
              />
            </div>
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label className="form-label">Buyer Contact Email</label>
              <input
                className="form-input"
                type="email"
                name="buyer_contact_email"
                value={recoveryForm.buyer_contact_email}
                onChange={handleRecoveryChange}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label">Recovery Code</label>
              <input
                className="form-input"
                type="text"
                name="recovery_code"
                value={recoveryForm.recovery_code}
                onChange={handleRecoveryChange}
                placeholder="AOC-RECOVERY-XXXX-XXXX-XXXX-XXXX"
                style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
                required
              />
            </div>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Checkout Session</h2>
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label className="form-label">Stripe Checkout Session ID</label>
              <input
                className="form-input"
                type="text"
                name="session_id"
                value={sessionForm.session_id}
                onChange={handleSessionChange}
                placeholder="cs_..."
                required
              />
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                Find this in your Stripe payment confirmation email or browser URL after checkout.
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">Buyer Contact Email</label>
              <input
                className="form-input"
                type="email"
                name="buyer_contact_email"
                value={sessionForm.buyer_contact_email}
                onChange={handleSessionChange}
                placeholder="you@example.com"
                required
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ width: '100%', padding: '14px 24px', fontSize: 16, marginBottom: 24 }}
        >
          {loading ? 'Verifying...' : 'Recover Access →'}
        </button>
      </form>

      <div className="card" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          <strong>Lost both your admin link and recovery code?</strong>
          <br />
          Automated recovery is not available without a recovery code or verified checkout session.
          <br />
          <a href="mailto:hello@architectsofchange.ai?subject=Registry+Access+Recovery" style={{ color: 'inherit', textDecoration: 'underline' }}>
            Contact Soberanía support
          </a>
        </div>
      </div>
    </div>
  );
}
