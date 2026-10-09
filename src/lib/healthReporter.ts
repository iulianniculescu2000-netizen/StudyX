import type { HealthCheckItem } from '../store/diagnosticsStore';

export function deriveHealthStatus(checks: HealthCheckItem[]) {
  if (checks.some((check) => check.status === 'error')) return 'degraded' as const;
  if (checks.some((check) => check.status === 'warning')) return 'warning' as const;
  return 'healthy' as const;
}

export function getHealthBadgeLabel(status: 'healthy' | 'warning' | 'degraded') {
  if (status === 'healthy') return 'Sistem stabil';
  if (status === 'warning') return 'Atenție moderată';
  return 'Mod degradat';
}
