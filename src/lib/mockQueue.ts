/**
 * Local storage & BroadcastChannel fallback queue engine.
 * Active when Supabase credentials are not configured in .env.local.
 * Provides full multi-tab / multi-window synchronization on the same device.
 */

import type { Token, TokenStatus, ServiceType } from './database.types';
import { isValidTransition, getServiceConfig, ALLOWED_TRANSITIONS } from './database.types';
import type { QueuePressure } from './queue';

const STORAGE_KEY = 'prayas_pulse_mock_tokens';
const CHANNEL_NAME = 'prayas_pulse_sync_channel';

// In-memory cache + broadcast listeners
let subscribers: Array<(payload: { eventType: string; new: Token; old: Token }) => void> = [];

// Setup BroadcastChannel if available
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      const payload = event.data;
      if (payload && payload.new) {
        subscribers.forEach(cb => {
          try { cb(payload); } catch (e) { console.error(e); }
        });
      }
    };
  } catch (e) {
    console.warn('BroadcastChannel not initialized:', e);
  }
}

export function getStoredTokens(): Token[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistTokens(tokens: Token[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
}

function broadcastChange(eventType: 'INSERT' | 'UPDATE' | 'DELETE', newToken: Token, oldToken: Token) {
  const payload = { eventType, new: newToken, old: oldToken };
  subscribers.forEach(cb => {
    try { cb(payload); } catch (e) { console.error(e); }
  });
  if (broadcastChannel) {
    try { broadcastChannel.postMessage(payload); } catch {}
  }
}

export async function mockGenerateToken(
  serviceType: ServiceType,
  sessionId: string
): Promise<Token> {
  const tokens = getStoredTokens();

  // Check if session already has an active token
  const existing = tokens.find(
    t => t.session_id === sessionId && (t.status === 'waiting' || t.status === 'called' || t.status === 'serving')
  );
  if (existing) {
    return existing;
  }

  const prefix = getServiceConfig(serviceType).prefix;
  const today = new Date().toISOString().slice(0, 10);

  // Count existing tokens today for this service
  const todayTokens = tokens.filter(
    t => t.service_type === serviceType && t.created_at.startsWith(today)
  );

  let nextNum = 1;
  if (todayTokens.length > 0) {
    const numbers = todayTokens
      .map(t => parseInt(t.token_number.split('-')[1] || '0', 10))
      .filter(n => !isNaN(n));
    if (numbers.length > 0) {
      nextNum = Math.max(...numbers) + 1;
    }
  }

  const tokenNumber = `${prefix}-${String(nextNum).padStart(3, '0')}`;

  const newToken: Token = {
    id: crypto.randomUUID(),
    token_number: tokenNumber,
    service_type: serviceType,
    status: 'waiting',
    counter_number: null,
    session_id: sessionId,
    created_at: new Date().toISOString(),
    called_at: null,
    started_at: null,
    completed_at: null,
  };

  tokens.push(newToken);
  persistTokens(tokens);
  broadcastChange('INSERT', newToken, newToken);

  return newToken;
}

export async function mockUpdateTokenStatus(
  tokenId: string,
  newStatus: TokenStatus
): Promise<Token> {
  const tokens = getStoredTokens();
  const index = tokens.findIndex(t => t.id === tokenId);
  if (index === -1) {
    throw new Error('Token not found');
  }

  const current = tokens[index];
  if (!isValidTransition(current.status, newStatus)) {
    throw new Error(
      `Invalid status transition: ${current.status} → ${newStatus}. Allowed: ${ALLOWED_TRANSITIONS[current.status].join(', ') || 'none'}`
    );
  }

  const now = new Date().toISOString();
  const updated: Token = {
    ...current,
    status: newStatus,
    called_at: newStatus === 'called' ? now : current.called_at,
    started_at: newStatus === 'serving' ? now : current.started_at,
    completed_at: newStatus === 'completed' ? now : current.completed_at,
  };

  tokens[index] = updated;
  persistTokens(tokens);
  broadcastChange('UPDATE', updated, current);

  return updated;
}

export async function mockCallNextToken(
  serviceType: ServiceType | null,
  counterNumber: number = 1
): Promise<Token | null> {
  const tokens = getStoredTokens();

  // Find next waiting token FIFO
  const waitingTokens = tokens
    .filter(t => t.status === 'waiting' && (!serviceType || t.service_type === serviceType))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (waitingTokens.length === 0) {
    return null;
  }

  const next = waitingTokens[0];
  const now = new Date().toISOString();
  const updated: Token = {
    ...next,
    status: 'called',
    called_at: now,
    counter_number: counterNumber,
  };

  const idx = tokens.findIndex(t => t.id === next.id);
  tokens[idx] = updated;
  persistTokens(tokens);
  broadcastChange('UPDATE', updated, next);

  return updated;
}

export async function mockFetchTodayTokens(): Promise<Token[]> {
  const today = new Date().toISOString().slice(0, 10);
  return getStoredTokens().filter(t => t.created_at.startsWith(today));
}

export async function mockFetchSessionToken(sessionId: string): Promise<Token | null> {
  const tokens = getStoredTokens();
  const active = tokens.find(
    t => t.session_id === sessionId && (t.status === 'waiting' || t.status === 'called' || t.status === 'serving')
  );
  return active || null;
}

export async function mockCalculateETA(
  serviceType: ServiceType,
  tokensAhead: number
): Promise<{ estimatedMinutes: number; basedOnHistory: boolean; sampleSize: number }> {
  const config = getServiceConfig(serviceType);
  if (tokensAhead <= 0) {
    return { estimatedMinutes: 0, basedOnHistory: true, sampleSize: 0 };
  }

  const tokens = getStoredTokens();
  const completed = tokens.filter(
    t => t.service_type === serviceType && t.status === 'completed' && t.completed_at
  );

  let avgDuration = config.estimatedDurationMinutes;
  let basedOnHistory = false;
  let sampleSize = 0;

  if (completed.length >= 3) {
    const durations: number[] = [];
    for (const t of completed) {
      const start = t.started_at || t.called_at;
      if (start && t.completed_at) {
        const mins = (new Date(t.completed_at).getTime() - new Date(start).getTime()) / 60000;
        if (mins > 0 && mins < 120) durations.push(mins);
      }
    }
    if (durations.length >= 3) {
      avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      basedOnHistory = true;
      sampleSize = durations.length;
    }
  }

  const estimatedMinutes = Math.max(0, Math.round(tokensAhead * avgDuration));
  return { estimatedMinutes, basedOnHistory, sampleSize };
}

export async function mockCalculateQueuePressure(
  serviceType: ServiceType,
  windowMinutes: number = 15
): Promise<QueuePressure> {
  const unknown: QueuePressure = {
    level: 'unknown',
    ratio: null,
    arrivalRate: null,
    serviceRate: null,
    windowMinutes,
  };

  const tokens = getStoredTokens();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).getTime();

  const arrivals = tokens.filter(
    t => t.service_type === serviceType && new Date(t.created_at).getTime() >= windowStart
  ).length;

  const completed = tokens.filter(
    t => t.service_type === serviceType &&
         t.status === 'completed' &&
         t.completed_at &&
         new Date(t.completed_at).getTime() >= windowStart
  ).length;

  if (arrivals < 3) return unknown;

  const arrivalRate = arrivals / windowMinutes;
  const serviceRate = completed / windowMinutes;

  if (serviceRate === 0) {
    if (arrivals >= 5) {
      return { level: 'watch', ratio: null, arrivalRate, serviceRate: 0, windowMinutes };
    }
    return unknown;
  }

  const ratio = arrivalRate / serviceRate;
  let level: QueuePressure['level'] = 'normal';
  if (ratio >= 1.0) level = 'congested';
  else if (ratio >= 0.8) level = 'watch';

  return { level, ratio, arrivalRate, serviceRate, windowMinutes };
}

export function mockSubscribeToTokenChanges(
  callback: (payload: { eventType: string; new: Token; old: Token }) => void
): () => void {
  subscribers.push(callback);

  // Storage event listener for multi-tab sync when BroadcastChannel is not supported
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const currentTokens = JSON.parse(e.newValue);
        if (currentTokens.length > 0) {
          const lastToken = currentTokens[currentTokens.length - 1];
          callback({ eventType: 'UPDATE', new: lastToken, old: lastToken });
        }
      } catch {}
    }
  };

  window.addEventListener('storage', onStorage);

  return () => {
    subscribers = subscribers.filter(cb => cb !== callback);
    window.removeEventListener('storage', onStorage);
  };
}

export async function mockResetTodayQueue(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
    // Broadcast empty delete event
    const dummyToken: Token = {
      id: '__all__',
      token_number: '',
      service_type: 'bonafide',
      status: 'cancelled',
      counter_number: null,
      session_id: null,
      created_at: new Date().toISOString(),
      called_at: null,
      started_at: null,
      completed_at: null,
    };
    broadcastChange('DELETE', dummyToken, dummyToken);
  }
}
