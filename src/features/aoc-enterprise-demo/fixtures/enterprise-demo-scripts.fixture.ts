import type { DemoScriptAudience } from '../domain/demo-script.js';

export interface DemoScriptAudienceProfile {
  readonly audience: DemoScriptAudience;
  readonly durationMinutes: number;
  readonly openingPrefix: string;
  readonly closingSuffix: string;
}

/** Per-audience framing used by DemoScriptService to keep generated talk tracks deterministic and consistent in tone. */
export const DEMO_SCRIPT_AUDIENCE_PROFILES: readonly DemoScriptAudienceProfile[] = [
  {
    audience: 'executive',
    durationMinutes: 4,
    openingPrefix: 'For a business audience: ',
    closingSuffix: 'That is the enterprise value AOC delivers here.',
  },
  {
    audience: 'technical',
    durationMinutes: 6,
    openingPrefix: 'For an engineering audience: ',
    closingSuffix: 'Every decision above is backed by a runtime call, not a mock.',
  },
  {
    audience: 'operator',
    durationMinutes: 5,
    openingPrefix: 'For the operator running this walkthrough: ',
    closingSuffix: 'Use the Control Plane panels referenced above to verify each step live.',
  },
  {
    audience: 'investor',
    durationMinutes: 3,
    openingPrefix: 'For an investor audience: ',
    closingSuffix: 'This is what makes AOC governance demonstrable, not just architected.',
  },
];
