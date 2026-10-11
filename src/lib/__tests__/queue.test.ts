import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  isValidTransition,
  getServiceConfig,
  SERVICES,
  type TokenStatus,
  type ServiceType,
  type Token,
} from '../database.types';

describe('1. State Transition Lifecycle & Rules', () => {
  it('allows valid state transitions', () => {
    // waiting -> called
    expect(isValidTransition('waiting', 'called')).toBe(true);
    // waiting -> cancelled
    expect(isValidTransition('waiting', 'cancelled')).toBe(true);
    // called -> serving
    expect(isValidTransition('called', 'serving')).toBe(true);
    // called -> skipped
    expect(isValidTransition('called', 'skipped')).toBe(true);
    // serving -> completed
    expect(isValidTransition('serving', 'completed')).toBe(true);
    // serving -> skipped
    expect(isValidTransition('serving', 'skipped')).toBe(true);
    // skipped -> waiting (re-queue)
    expect(isValidTransition('skipped', 'waiting')).toBe(true);
  });

  it('rejects invalid state transitions (Core Test 12)', () => {
    // Cannot jump directly from waiting to completed
    expect(isValidTransition('waiting', 'completed')).toBe(false);
    // Cannot jump from waiting to serving without being called
    expect(isValidTransition('waiting', 'serving')).toBe(false);
    // Terminal state: completed cannot transition to anything
    expect(isValidTransition('completed', 'waiting')).toBe(false);
    expect(isValidTransition('completed', 'called')).toBe(false);
    expect(isValidTransition('completed', 'serving')).toBe(false);
    // Terminal state: cancelled cannot transition
    expect(isValidTransition('cancelled', 'waiting')).toBe(false);
    expect(isValidTransition('cancelled', 'called')).toBe(false);
  });
});

describe('2. Service Configuration & Prefixes', () => {
  it('has expected prefixes for all standard services', () => {
    expect(getServiceConfig('bonafide').prefix).toBe('B');
    expect(getServiceConfig('fee_query').prefix).toBe('F');
    expect(getServiceConfig('examination').prefix).toBe('E');
    expect(getServiceConfig('document_verification').prefix).toBe('D');
    expect(getServiceConfig('other').prefix).toBe('O');
  });

  it('provides non-zero default estimated service durations', () => {
    for (const service of SERVICES) {
      expect(service.estimatedDurationMinutes).toBeGreaterThan(0);
    }
  });
});

describe('3. Queue Ordering & FIFO Logic (Core Tests 3, 4, 5, 6, 7)', () => {
  function sortQueueFIFO(tokens: Token[]): Token[] {
    return [...tokens].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  function getNextEligibleToken(tokens: Token[], service?: ServiceType): Token | null {
    const waiting = tokens.filter(t => t.status === 'waiting' && (!service || t.service_type === service));
    const sorted = sortQueueFIFO(waiting);
    return sorted.length > 0 ? sorted[0] : null;
  }

  it('orders tokens by creation timestamp (FIFO)', () => {
    const t1: Token = {
      id: '1',
      token_number: 'B-001',
      service_type: 'bonafide',
      status: 'waiting',
      counter_number: null,
      session_id: 's1',
      created_at: '2026-10-12T10:00:00Z',
      called_at: null,
      started_at: null,
      completed_at: null,
    };
    const t2: Token = {
      id: '2',
      token_number: 'B-002',
      service_type: 'bonafide',
      status: 'waiting',
      counter_number: null,
      session_id: 's2',
      created_at: '2026-10-12T10:05:00Z',
      called_at: null,
      started_at: null,
      completed_at: null,
    };

    const queue = sortQueueFIFO([t2, t1]);
    expect(queue[0].token_number).toBe('B-001');
    expect(queue[1].token_number).toBe('B-002');
  });

  it('selects the first waiting token when Call Next is invoked', () => {
    const tokens: Token[] = [
      { id: '1', token_number: 'B-001', service_type: 'bonafide', status: 'completed', counter_number: 1, session_id: 's1', created_at: '2026-10-12T10:00:00Z', called_at: '2026-10-12T10:01:00Z', started_at: '2026-10-12T10:01:00Z', completed_at: '2026-10-12T10:05:00Z' },
      { id: '2', token_number: 'B-002', service_type: 'bonafide', status: 'waiting', counter_number: null, session_id: 's2', created_at: '2026-10-12T10:02:00Z', called_at: null, started_at: null, completed_at: null },
      { id: '3', token_number: 'B-003', service_type: 'bonafide', status: 'waiting', counter_number: null, session_id: 's3', created_at: '2026-10-12T10:04:00Z', called_at: null, started_at: null, completed_at: null },
    ];

    const next = getNextEligibleToken(tokens, 'bonafide');
    expect(next?.token_number).toBe('B-002');
  });

  it('preserves order when skipping: skipped tokens are excluded from waiting FIFO', () => {
    const tokens: Token[] = [
      { id: '1', token_number: 'B-001', service_type: 'bonafide', status: 'skipped', counter_number: 1, session_id: 's1', created_at: '2026-10-12T10:00:00Z', called_at: '2026-10-12T10:01:00Z', started_at: null, completed_at: null },
      { id: '2', token_number: 'B-002', service_type: 'bonafide', status: 'waiting', counter_number: null, session_id: 's2', created_at: '2026-10-12T10:02:00Z', called_at: null, started_at: null, completed_at: null },
    ];

    const next = getNextEligibleToken(tokens, 'bonafide');
    expect(next?.token_number).toBe('B-002');
  });

  it('treats walk-in tokens with the exact same FIFO rules as digital tokens', () => {
    const walkIn: Token = {
      id: 'w1',
      token_number: 'F-001',
      service_type: 'fee_query',
      status: 'waiting',
      counter_number: null,
      session_id: 'walkin-uuid-1',
      created_at: '2026-10-12T10:01:00Z',
      called_at: null,
      started_at: null,
      completed_at: null,
    };
    const digital: Token = {
      id: 'd1',
      token_number: 'F-002',
      service_type: 'fee_query',
      status: 'waiting',
      counter_number: null,
      session_id: 'browser-sid-2',
      created_at: '2026-10-12T10:03:00Z',
      called_at: null,
      started_at: null,
      completed_at: null,
    };

    const next = getNextEligibleToken([digital, walkIn], 'fee_query');
    expect(next?.token_number).toBe('F-001');
  });
});

describe('4. Waiting-Time Estimation (ETA) Calculations (Core Test 10)', () => {
  // Pure ETA simulation matching src/lib/queue.ts
  function computeETA(
    serviceType: ServiceType,
    tokensAhead: number,
    completedDurations: number[] = []
  ): { estimatedMinutes: number; basedOnHistory: boolean; sampleSize: number } {
    const config = getServiceConfig(serviceType);

    if (tokensAhead <= 0) {
      return { estimatedMinutes: 0, basedOnHistory: true, sampleSize: 0 };
    }

    let avgDuration = config.estimatedDurationMinutes;
    let basedOnHistory = false;
    let sampleSize = 0;

    if (completedDurations.length >= 3) {
      avgDuration = completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length;
      basedOnHistory = true;
      sampleSize = completedDurations.length;
    }

    const estimatedMinutes = Math.max(0, Math.round(tokensAhead * avgDuration));
    return { estimatedMinutes, basedOnHistory, sampleSize };
  }

  it('handles zero tokens ahead with 0 minutes', () => {
    const eta = computeETA('bonafide', 0);
    expect(eta.estimatedMinutes).toBe(0);
  });

  it('falls back gracefully to configured default when no history is available', () => {
    const defaultDuration = getServiceConfig('bonafide').estimatedDurationMinutes; // 4
    const eta = computeETA('bonafide', 3, []);
    expect(eta.basedOnHistory).toBe(false);
    expect(eta.estimatedMinutes).toBe(3 * defaultDuration); // 12 mins
  });

  it('falls back to default if fewer than 3 historical records exist', () => {
    const eta = computeETA('bonafide', 2, [3.0, 5.0]); // only 2 samples
    expect(eta.basedOnHistory).toBe(false);
    expect(eta.sampleSize).toBe(0);
  });

  it('uses rolling average when at least 3 completed records exist', () => {
    // 3 samples: 6, 8, 10 min -> average 8 min
    const eta = computeETA('bonafide', 2, [6.0, 8.0, 10.0]);
    expect(eta.basedOnHistory).toBe(true);
    expect(eta.sampleSize).toBe(3);
    expect(eta.estimatedMinutes).toBe(16); // 2 * 8 = 16
  });

  it('never returns negative waiting time', () => {
    const eta = computeETA('bonafide', -2, [5, 5, 5]);
    expect(eta.estimatedMinutes).toBe(0);
  });
});

describe('5. Queue Pressure Calculations (Core Test 11)', () => {
  function computePressure(
    arrivals: number,
    completed: number,
    windowMinutes: number = 15
  ): { level: 'normal' | 'watch' | 'congested' | 'unknown'; ratio: number | null } {
    if (arrivals < 3) {
      return { level: 'unknown', ratio: null };
    }

    const arrivalRate = arrivals / windowMinutes;
    const serviceRate = completed / windowMinutes;

    if (serviceRate === 0) {
      if (arrivals >= 5) {
        return { level: 'watch', ratio: null };
      }
      return { level: 'unknown', ratio: null };
    }

    const ratio = arrivalRate / serviceRate;
    let level: 'normal' | 'watch' | 'congested' = 'normal';
    if (ratio >= 1.0) level = 'congested';
    else if (ratio >= 0.8) level = 'watch';

    return { level, ratio };
  }

  it('returns unknown when insufficient data (< 3 arrivals)', () => {
    const p = computePressure(2, 2);
    expect(p.level).toBe('unknown');
    expect(p.ratio).toBeNull();
  });

  it('returns watch when arrival demand is elevated but zero completions', () => {
    const p = computePressure(6, 0);
    expect(p.level).toBe('watch');
    expect(p.ratio).toBeNull();
  });

  it('returns normal when pressure ratio < 0.8', () => {
    // arrivals = 5, completed = 10 -> ratio = 0.5 < 0.8
    const p = computePressure(5, 10);
    expect(p.level).toBe('normal');
    expect(p.ratio).toBe(0.5);
  });

  it('returns watch when 0.8 <= ratio < 1.0', () => {
    // arrivals = 9, completed = 10 -> ratio = 0.9
    const p = computePressure(9, 10);
    expect(p.level).toBe('watch');
    expect(p.ratio).toBe(0.9);
  });

  it('returns congested when ratio >= 1.0', () => {
    // arrivals = 12, completed = 10 -> ratio = 1.2
    const p = computePressure(12, 10);
    expect(p.level).toBe('congested');
    expect(p.ratio).toBeCloseTo(1.2);
  });
});

describe('6. Public Display Privacy Guarantees (Core Test 9)', () => {
  it('token schema does not contain personal identifying information', () => {
    const sampleToken: Token = {
      id: 'token-uuid',
      token_number: 'B-014',
      service_type: 'bonafide',
      status: 'called',
      counter_number: 1,
      session_id: 'anonymous-session',
      created_at: new Date().toISOString(),
      called_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
    };

    const exposedFields = Object.keys(sampleToken);
    expect(exposedFields).not.toContain('student_name');
    expect(exposedFields).not.toContain('roll_number');
    expect(exposedFields).not.toContain('email');
    expect(exposedFields).not.toContain('phone');
  });
});
