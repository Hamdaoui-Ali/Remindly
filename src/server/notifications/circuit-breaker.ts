export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  openedAt: Date | null;
  lastFailureCode: string | null;
}

export interface CircuitBreakerPolicy {
  failureThreshold: number;
  openForMilliseconds: number;
}

const BREAKER_FAILURE_CODES = new Set([
  'gmail_auth_revoked',
  'gmail_auth_invalid_grant',
  'gmail_config_missing',
  'gmail_forbidden',
  'gmail_daily_limit',
]);

export function initialCircuitBreakerState(): CircuitBreakerState {
  return { state: 'closed', failureCount: 0, openedAt: null, lastFailureCode: null };
}

export function recordCircuitFailure(
  state: CircuitBreakerState,
  code: string,
  now: Date,
  policy: CircuitBreakerPolicy,
): CircuitBreakerState {
  if (!BREAKER_FAILURE_CODES.has(code)) return state;
  const failureCount = state.failureCount + 1;
  return {
    state: failureCount >= policy.failureThreshold ? 'open' : state.state,
    failureCount,
    openedAt: failureCount >= policy.failureThreshold ? now : state.openedAt,
    lastFailureCode: code,
  };
}

export function advanceCircuitBreaker(
  state: CircuitBreakerState,
  now: Date,
  policy: CircuitBreakerPolicy,
  success = false,
): CircuitBreakerState & { allowed: boolean } {
  if (success) return { ...initialCircuitBreakerState(), allowed: true };
  if (state.state === 'open' && state.openedAt && now.getTime() - state.openedAt.getTime() >= policy.openForMilliseconds) {
    return { ...state, state: 'half_open', allowed: true };
  }
  return { ...state, allowed: state.state !== 'open' };
}
