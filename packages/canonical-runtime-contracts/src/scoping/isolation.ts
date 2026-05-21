export const ISOLATION_MODES = {
  LOGICAL: 'logical',
  STRONG: 'strong',
  SOVEREIGN: 'sovereign',
} as const;

export type IsolationMode = typeof ISOLATION_MODES[keyof typeof ISOLATION_MODES];

export interface TenantIsolationProfile {
  readonly mode: IsolationMode;
  readonly region?: string;
  readonly keyRootRef?: string;
}
