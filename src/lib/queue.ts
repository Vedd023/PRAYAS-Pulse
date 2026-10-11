/**
 * Queue operations module.
 * All database interactions for token management go through this module.
 * This is the single source of truth for queue logic.
 *
 * When Supabase credentials are configured, it uses live PostgreSQL and Supabase Realtime.
 * When Supabase is not configured, it gracefully operates via local storage and BroadcastChannel,
 * allowing full multi-tab testing on the same machine.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import type { Token, TokenStatus, ServiceType } from './database.types';
import { isValidTransition, getServiceConfig, ALLOWED_TRANSITIONS } from './database.types';
import {
  mockGenerateToken,
  mockUpdateTokenStatus,
  mockCallNextToken,
  mockFetchTodayTokens,
  mockFetchSessionToken,
  mockCalculateETA,
  mockCalculateQueuePressure,
  mockSubscribeToTokenChanges,
  mockResetTodayQueue,
} from './mockQueue';

// ──────────────────────────────────────────────
// Session management
// ──────────────────────────────────────────────

/**
 * Get or create a session ID for the current browser.
 * Used to associate a student with their token without requiring login.
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'mock-session-id';
  let sid = localStorage.getItem('prayas_session_id');
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem('prayas_session_id', sid);
  }
  return sid;
}

// ──────────────────────────────────────────────
// Token Generation
// ──────────────────────────────────────────────

/**
 * Generate a new token for a service.
 * Uses a database function to atomically generate sequential token numbers.
 * Falls back to a client-side approach or mock queue if Supabase is unavailable.
 */
export async function generateToken(
  serviceType: ServiceType,
  sessionId?: string
): Promise<Token> {
  const sid = sessionId || getSessionId();

  if (!isSupabaseConfigured()) {
    return mockGenerateToken(serviceType, sid);
  }

  // Check if session already has an active token
  const { data: existingToken } = await supabase
    .from('tokens')
    .select('*')
    .eq('session_id', sid)
    .in('status', ['waiting', 'called', 'serving'])
    .maybeSingle();

  if (existingToken) {
    return existingToken as Token;
  }

  // Try the RPC function first (atomic, race-condition-safe)
  const { data: rpcToken, error: rpcError } = await supabase
    .rpc('generate_token', {
      p_service_type: serviceType,
      p_session_id: sid,
    });

  if (!rpcError && rpcToken) {
    const token = Array.isArray(rpcToken) ? rpcToken[0] : rpcToken;
    return token as Token;
  }

  // Fallback: client-side token generation
  console.warn('RPC generate_token not available, using client-side fallback:', rpcError?.message);

  const today = new Date().toISOString().slice(0, 10);
  const prefix = getServiceConfig(serviceType).prefix;

  // Get the highest token number for this service today
  const { data: lastTokens } = await supabase
    .from('tokens')
    .select('token_number')
    .eq('service_type', serviceType)
    .gte('created_at', `${today}T00:00:00`)
    .order('created_at', { ascending: false })
    .limit(1);

  let nextNum = 1;
  const lastArray = (lastTokens as any[]) || [];
  if (lastArray.length > 0) {
    const lastNum = parseInt(lastArray[0].token_number.split('-')[1], 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }

  const tokenNumber = `${prefix}-${String(nextNum).padStart(3, '0')}`;

  const { data: newToken, error: insertError } = await supabase
    .from('tokens')
    .insert({
      token_number: tokenNumber,
      service_type: serviceType,
      status: 'waiting' as TokenStatus,
      session_id: sid,
      counter_number: null,
      called_at: null,
      started_at: null,
      completed_at: null,
    })
    .select()
    .single();

  if (insertError || !newToken) {
    throw new Error(`Failed to create token: ${insertError?.message || 'Unknown error'}`);
  }

  return newToken as Token;
}

// ──────────────────────────────────────────────
// Token Status Updates
// ──────────────────────────────────────────────

/**
 * Update a token's status with transition validation.
 */
export async function updateTokenStatus(
  tokenId: string,
  newStatus: TokenStatus
): Promise<Token> {
  if (!isSupabaseConfigured()) {
    return mockUpdateTokenStatus(tokenId, newStatus);
  }

  // Fetch current token
  const { data: current, error: fetchError } = await supabase
    .from('tokens')
    .select('*')
    .eq('id', tokenId)
    .single();

  if (fetchError || !current) {
    throw new Error(`Token not found: ${fetchError?.message}`);
  }

  const token = current as Token;

  if (!isValidTransition(token.status, newStatus)) {
    throw new Error(
      `Invalid status transition: ${token.status} → ${newStatus}. ` +
      `Allowed: ${ALLOWED_TRANSITIONS[token.status].join(', ') || 'none'}`
    );
  }

  const now = new Date().toISOString();
  const updates: Partial<Token> = { status: newStatus };

  switch (newStatus) {
    case 'called':
      updates.called_at = now;
      break;
    case 'serving':
      updates.started_at = now;
      break;
    case 'completed':
      updates.completed_at = now;
      break;
    case 'skipped':
      break;
  }

  const { data: updated, error: updateError } = await supabase
    .from('tokens')
    .update(updates)
    .eq('id', tokenId)
    .select()
    .single();

  if (updateError || !updated) {
    throw new Error(`Failed to update token: ${updateError?.message}`);
  }

  return updated as Token;
}

/**
 * Call the next waiting token for a service (or any service if null).
 */
export async function callNextToken(
  serviceType: ServiceType | null,
  counterNumber: number = 1
): Promise<Token | null> {
  if (!isSupabaseConfigured()) {
    return mockCallNextToken(serviceType, counterNumber);
  }

  // Build query for next waiting token (FIFO)
  let query = supabase
    .from('tokens')
    .select('*')
    .eq('status', 'waiting')
    .order('created_at', { ascending: true })
    .limit(1);

  if (serviceType) {
    query = query.eq('service_type', serviceType);
  }

  const { data: waitingTokens, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch next token: ${error.message}`);
  }

  const waitingArray = (waitingTokens as any[]) || [];
  if (waitingArray.length === 0) {
    return null;
  }

  const nextToken = waitingArray[0] as Token;

  // Update to called
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('tokens')
    .update({
      status: 'called' as TokenStatus,
      called_at: now,
      counter_number: counterNumber,
    })
    .eq('id', nextToken.id)
    .eq('status', 'waiting') // optimistic lock
    .select()
    .single();

  if (updateError || !updated) {
    throw new Error(`Failed to call token: ${updateError?.message || 'Token may have been claimed by another counter'}`);
  }

  return updated as Token;
}

// ──────────────────────────────────────────────
// Token Queries
// ──────────────────────────────────────────────

/** Fetch all tokens for today, ordered by creation time. */
export async function fetchTodayTokens(): Promise<Token[]> {
  if (!isSupabaseConfigured()) {
    return mockFetchTodayTokens();
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .gte('created_at', `${today}T00:00:00`)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch tokens: ${error.message}`);
  }

  return (data || []) as Token[];
}

/** Fetch the active token for the current session. */
export async function fetchSessionToken(sessionId?: string): Promise<Token | null> {
  const sid = sessionId || getSessionId();

  if (!isSupabaseConfigured()) {
    return mockFetchSessionToken(sid);
  }

  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('session_id', sid)
    .in('status', ['waiting', 'called', 'serving'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch session token:', error.message);
    return null;
  }

  return (data as unknown as Token) || null;
}

/** Create a walk-in token (no browser session association). */
export async function createWalkInToken(serviceType: ServiceType): Promise<Token> {
  const walkInSessionId = `walkin-${crypto.randomUUID()}`;
  return generateToken(serviceType, walkInSessionId);
}

// ──────────────────────────────────────────────
// ETA Estimation
// ──────────────────────────────────────────────

/**
 * Calculate the estimated waiting time for a token.
 *
 * Formula (single counter):
 *   ETA = tokensAhead × avgServiceDuration
 */
export async function calculateETA(
  serviceType: ServiceType,
  tokensAhead: number
): Promise<{ estimatedMinutes: number; basedOnHistory: boolean; sampleSize: number }> {
  if (!isSupabaseConfigured()) {
    return mockCalculateETA(serviceType, tokensAhead);
  }

  const config = getServiceConfig(serviceType);

  if (tokensAhead <= 0) {
    return { estimatedMinutes: 0, basedOnHistory: true, sampleSize: 0 };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: completedTokens } = await supabase
    .from('tokens')
    .select('called_at, started_at, completed_at')
    .eq('service_type', serviceType)
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .gte('created_at', `${today}T00:00:00`)
    .order('completed_at', { ascending: false })
    .limit(20);

  let avgDurationMinutes = config.estimatedDurationMinutes;
  let basedOnHistory = false;
  let sampleSize = 0;

  const records = (completedTokens as any[]) || [];
  if (records.length >= 3) {
    const durations: number[] = [];
    for (const t of records) {
      const startTime = t.started_at || t.called_at;
      if (startTime && t.completed_at) {
        const durationMs = new Date(t.completed_at).getTime() - new Date(startTime).getTime();
        const durationMin = durationMs / 60000;
        if (durationMin > 0 && durationMin < 120) {
          durations.push(durationMin);
        }
      }
    }

    if (durations.length >= 3) {
      avgDurationMinutes = durations.reduce((a, b) => a + b, 0) / durations.length;
      basedOnHistory = true;
      sampleSize = durations.length;
    }
  }

  const estimatedMinutes = Math.max(0, Math.round(tokensAhead * avgDurationMinutes));

  return { estimatedMinutes, basedOnHistory, sampleSize };
}

// ──────────────────────────────────────────────
// Queue Pressure
// ──────────────────────────────────────────────

export interface QueuePressure {
  level: 'normal' | 'watch' | 'congested' | 'unknown';
  ratio: number | null;
  arrivalRate: number | null;
  serviceRate: number | null;
  windowMinutes: number;
}

export async function calculateQueuePressure(
  serviceType: ServiceType,
  windowMinutes: number = 15
): Promise<QueuePressure> {
  if (!isSupabaseConfigured()) {
    return mockCalculateQueuePressure(serviceType, windowMinutes);
  }

  const unknown: QueuePressure = {
    level: 'unknown',
    ratio: null,
    arrivalRate: null,
    serviceRate: null,
    windowMinutes,
  };

  try {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    const { count: arrivals } = await supabase
      .from('tokens')
      .select('*', { count: 'exact', head: true })
      .eq('service_type', serviceType)
      .gte('created_at', windowStart);

    const { count: completed } = await supabase
      .from('tokens')
      .select('*', { count: 'exact', head: true })
      .eq('service_type', serviceType)
      .eq('status', 'completed')
      .gte('completed_at', windowStart);

    if (arrivals === null || arrivals < 3) {
      return unknown;
    }

    const arrivalRate = arrivals / windowMinutes;
    const serviceRate = (completed || 0) / windowMinutes;

    if (serviceRate === 0) {
      if (arrivals >= 5) {
        return {
          level: 'watch',
          ratio: null,
          arrivalRate,
          serviceRate: 0,
          windowMinutes,
        };
      }
      return unknown;
    }

    const ratio = arrivalRate / serviceRate;

    let level: QueuePressure['level'] = 'normal';
    if (ratio >= 1.0) level = 'congested';
    else if (ratio >= 0.8) level = 'watch';

    return { level, ratio, arrivalRate, serviceRate, windowMinutes };
  } catch {
    return unknown;
  }
}

// ──────────────────────────────────────────────
// Realtime Subscription
// ──────────────────────────────────────────────

/**
 * Subscribe to real-time changes on the tokens table.
 * Returns an unsubscribe function.
 */
export function subscribeToTokenChanges(
  callback: (payload: { eventType: string; new: Token; old: Token }) => void
): () => void {
  if (!isSupabaseConfigured()) {
    return mockSubscribeToTokenChanges(callback);
  }

  const channel = supabase
    .channel('tokens-realtime')
    .on(
      'postgres_changes' as any,
      {
        event: '*',
        schema: 'public',
        table: 'tokens',
      },
      (payload: any) => {
        callback({
          eventType: payload.eventType,
          new: payload.new as Token,
          old: payload.old as Token,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ──────────────────────────────────────────────
// Reset Queue
// ──────────────────────────────────────────────

/** Reset all tokens for today. Used for demo resets. */
export async function resetTodayQueue(): Promise<void> {
  if (!isSupabaseConfigured()) {
    return mockResetTodayQueue();
  }

  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from('tokens')
    .delete()
    .gte('created_at', `${today}T00:00:00`);

  if (error) {
    throw new Error(`Failed to reset queue: ${error.message}`);
  }
}
