'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BuyerAccountPublic } from '@/lib/buyer-account-types';

interface RegistryEntry {
  registryId: string;
  role: string;
  permissions: string[];
  registry: {
    organizationName: string;
    registryStatus: string;
    governanceLevel: string;
    maxPassports: number;
    issuedPassports: number;
    remainingPassports: number;
  } | null;
}

export default function DashboardPage() {
  const [account, setAccount] = useState<BuyerAccountPublic | null>(null);
  const [registries, setRegistries] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/account/me').then(r => r.json()),
      fetch('/api/account/registries').then(r => r.json()),
    ]).then(([me, regs]) => {
      if (me.ok) setAccount(me.data);
      else window.location.href = '/account/login?return=/account/dashboard';
      if (regs.ok) setRegistries(regs.data.registries);
    }).catch(() => {
      window.location.href = '/account/login?return=/account/dashboard';
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="container" style={{ paddingTop: 60 }}><p>Loading…</p></div>;
  }

  if (!account) return null;

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div className="section-label">Buyer Account</div>
        <h1>Buyer Dashboard</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Access your AOC Agent Registries, team memberships, and governance evidence.
        </p>
      </div>

      {/* Account header */}
      <div className="card" style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Account</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Email:</span> {account.email}</div>
          {account.displayName && <div><span style={{ color: 'var(--text-muted)' }}>Name:</span> {account.displayName}</div>}
          <div><span style={{ color: 'var(--text-muted)' }}>Status:</span> <span className={`badge badge-${account.status === 'active' ? 'active' : 'revoked'}`}>{account.status}</span></div>
        </div>
        <div style={{ marginTop: 16 }}>
          <Link href="/account/logout" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sign out</Link>
        </div>
      </div>

      {/* Registries */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Your Registries</h2>

        {registries.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
              No registries are linked to this account yet.
            </p>
            <Link href="/account/claim-registry" className="btn btn-primary">
              Claim an existing registry
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {registries.map(entry => (
              <div key={entry.registryId} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      {entry.registry?.organizationName ?? entry.registryId}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {entry.registryId}
                    </div>
                  </div>
                  <span className="badge badge-active">{entry.role}</span>
                </div>
                {entry.registry && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginTop: 12, fontSize: 13 }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Status:</span> {entry.registry.registryStatus}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Level:</span> {entry.registry.governanceLevel}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Issued:</span> {entry.registry.issuedPassports}/{entry.registry.maxPassports}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Remaining:</span> {entry.registry.remainingPassports}</div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                  <Link href={`/registry/admin?registry_id=${encodeURIComponent(entry.registryId)}`} className="btn btn-secondary" style={{ fontSize: 13 }}>
                    Open Registry
                  </Link>
                  {entry.permissions.includes('registry:enroll_agent') && (
                    <Link href={`/enroll-agent?registry_id=${encodeURIComponent(entry.registryId)}`} className="btn btn-secondary" style={{ fontSize: 13 }}>
                      Enroll Agent
                    </Link>
                  )}
                  {(entry.permissions.includes('registry:generate_exports') || entry.permissions.includes('registry:download_exports')) && (
                    <Link href={`/registry/admin?registry_id=${encodeURIComponent(entry.registryId)}#exports`} className="btn btn-secondary" style={{ fontSize: 13 }}>
                      Exports
                    </Link>
                  )}
                </div>
              </div>
            ))}

            <div style={{ marginTop: 8 }}>
              <Link href="/account/claim-registry" style={{ color: 'var(--accent)', fontSize: 14 }}>
                + Claim another registry
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
