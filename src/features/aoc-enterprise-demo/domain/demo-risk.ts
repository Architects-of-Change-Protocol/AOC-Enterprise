export type DemoRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type DemoRiskTone = 'neutral' | 'caution' | 'warning' | 'danger';

export function toneForDemoRiskLevel(riskLevel: DemoRiskLevel): DemoRiskTone {
  switch (riskLevel) {
    case 'low':
      return 'neutral';
    case 'medium':
      return 'caution';
    case 'high':
      return 'warning';
    case 'critical':
      return 'danger';
    default:
      return 'neutral';
  }
}
