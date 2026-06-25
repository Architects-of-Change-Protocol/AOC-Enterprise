'use client';

import { useEffect } from 'react';

export default function LogoutPage() {
  useEffect(() => {
    fetch('/api/account/logout', { method: 'POST' }).finally(() => {
      window.location.href = '/account/login';
    });
  }, []);

  return (
    <div className="container" style={{ paddingTop: 60 }}>
      <p>Signing out…</p>
    </div>
  );
}
