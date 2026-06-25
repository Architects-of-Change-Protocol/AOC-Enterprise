'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('return') ?? '/account/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/account/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? 'Sign in failed.');
        return;
      }
      window.location.href = returnUrl;
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 60, paddingBottom: 80, maxWidth: 480 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div className="section-label">Buyer Account</div>
        <h1>Sign in to your AOC buyer account</h1>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="alert alert-error">{error}</div>
            )}

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>

      <p style={{ marginTop: 24, color: 'var(--text-muted)', fontSize: 14 }}>
        Don&apos;t have an account?{' '}
        <Link href="/account/signup" style={{ color: 'var(--accent)' }}>Create one</Link>
      </p>
    </div>
  );
}
