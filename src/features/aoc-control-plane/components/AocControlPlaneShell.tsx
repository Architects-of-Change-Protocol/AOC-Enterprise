import * as React from 'react';

export interface AocControlPlaneShellProps {
  readonly trustDomainId: string;
  readonly availableTrustDomainIds?: readonly string[] | undefined;
  readonly onTrustDomainChange?: ((trustDomainId: string) => void) | undefined;
  readonly environment?: string | undefined;
  readonly emergencyDenyActive: boolean;
  readonly children: React.ReactNode;
}

export function AocControlPlaneShell({
  trustDomainId,
  availableTrustDomainIds,
  onTrustDomainChange,
  environment,
  emergencyDenyActive,
  children,
}: AocControlPlaneShellProps): React.ReactElement {
  const trustDomainOptions = availableTrustDomainIds ?? [trustDomainId];

  return (
    <div className="aoc-control-plane-shell">
      <header className="aoc-control-plane-shell__header">
        <div>
          <h1>Soberanía Control Plane</h1>
          <p className="aoc-control-plane-shell__subtitle">Governed execution for autonomous agents, tools, workflows and external systems</p>
        </div>
        <div className="aoc-control-plane-shell__header-controls">
          {environment !== undefined ? <span className="aoc-badge aoc-badge--neutral">{environment}</span> : null}
          {emergencyDenyActive ? (
            <span className="aoc-badge aoc-badge--danger" role="alert">
              Emergency deny active — all executions blocked
            </span>
          ) : null}
          <label className="aoc-control-plane-shell__trust-domain">
            Trust domain
            <select
              value={trustDomainId}
              disabled={onTrustDomainChange === undefined || trustDomainOptions.length <= 1}
              onChange={(event) => onTrustDomainChange?.(event.target.value)}
            >
              {trustDomainOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {children}
    </div>
  );
}
