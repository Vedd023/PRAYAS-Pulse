/**
 * Custom React hooks for queue state management.
 * These hooks provide the reactive data layer between the UI and queue operations.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Token, ServiceType, TokenStatus } from '../lib/database.types';
import { getServiceConfig } from '../lib/database.types';
import {
  fetchTodayTokens,
  fetchSessionToken,
  generateToken,
  updateTokenStatus,
  callNextToken,
  createWalkInToken,
  calculateETA,
  calculateQueuePressure,
  subscribeToTokenChanges,
  getSessionId,
  resetTodayQueue,
} from '../lib/queue';
import type { QueuePressure } from '../lib/queue';
import { isSupabaseConfigured } from '../lib/supabase';

// ──────────────────────────────────────────────
// useQueueData — master hook for all token data
// ──────────────────────────────────────────────

export interface QueueStats {
  totalWaiting: number;
  totalServing: number;
  totalCompleted: number;
  totalSkipped: number;
  totalToday: number;
  byService: Record<ServiceType, {
    waiting: number;
    serving: number;
    completed: number;
    currentToken: Token | null;
  }>;
}

export function useQueueData() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  const loadTokens = useCallback(async () => {
    try {
      if (!isSupabaseConfigured()) {
        setError('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
        setLoading(false);
        return;
      }
      const data = await fetchTodayTokens();
      setTokens(data);
      setError(null);
      setConnected(true);
    } catch (err: any) {
      setError(err.message);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  // Real-time subscription
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const unsubscribe = subscribeToTokenChanges((payload) => {
      setTokens(prev => {
        const newToken = payload.new;
        const idx = prev.findIndex(t => t.id === newToken.id);

        if (payload.eventType === 'DELETE') {
          return prev.filter(t => t.id !== (payload.old?.id || newToken.id));
        }

        if (idx >= 0) {
          // Update existing
          const updated = [...prev];
          updated[idx] = newToken;
          return updated;
        } else {
          // Insert new
          return [...prev, newToken].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
      });
      setConnected(true);
    });

    return unsubscribe;
  }, []);

  // Compute stats
  const stats: QueueStats = {
    totalWaiting: tokens.filter(t => t.status === 'waiting').length,
    totalServing: tokens.filter(t => t.status === 'called' || t.status === 'serving').length,
    totalCompleted: tokens.filter(t => t.status === 'completed').length,
    totalSkipped: tokens.filter(t => t.status === 'skipped').length,
    totalToday: tokens.length,
    byService: {} as any,
  };

  const serviceTypes: ServiceType[] = ['bonafide', 'fee_query', 'examination', 'document_verification', 'other'];
  for (const st of serviceTypes) {
    const serviceTokens = tokens.filter(t => t.service_type === st);
    const serving = serviceTokens.find(t => t.status === 'called' || t.status === 'serving');
    stats.byService[st] = {
      waiting: serviceTokens.filter(t => t.status === 'waiting').length,
      serving: serving ? 1 : 0,
      completed: serviceTokens.filter(t => t.status === 'completed').length,
      currentToken: serving || null,
    };
  }

  return {
    tokens,
    stats,
    loading,
    error,
    connected,
    refetch: loadTokens,
  };
}

// ──────────────────────────────────────────────
// useStudentToken — student's own token state
// ──────────────────────────────────────────────

export function useStudentToken() {
  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Load existing token for this session
  useEffect(() => {
    async function load() {
      try {
        if (!isSupabaseConfigured()) {
          setLoading(false);
          return;
        }
        const existing = await fetchSessionToken();
        setToken(existing);
      } catch (err: any) {
        console.error('Failed to load session token:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Subscribe to updates on the current token
  useEffect(() => {
    if (!token || !isSupabaseConfigured()) return;

    const unsubscribe = subscribeToTokenChanges((payload) => {
      if (payload.new && payload.new.id === token.id) {
        setToken(payload.new);
      }
    });

    return unsubscribe;
  }, [token?.id]);

  const createToken = useCallback(async (serviceType: ServiceType) => {
    setGenerating(true);
    setError(null);
    try {
      const newToken = await generateToken(serviceType);
      setToken(newToken);
      return newToken;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setGenerating(false);
    }
  }, []);

  const cancelToken = useCallback(async () => {
    if (!token) return;
    try {
      const updated = await updateTokenStatus(token.id, 'cancelled');
      setToken(null);
      return updated;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [token]);

  return { token, loading, error, generating, createToken, cancelToken, setToken };
}

// ──────────────────────────────────────────────
// useStaffActions — staff dashboard operations
// ──────────────────────────────────────────────

export function useStaffActions() {
  const [operationPending, setOperationPending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setLastError(null);
    setLastSuccess(null);
  }, []);

  const doCallNext = useCallback(async (serviceType: ServiceType | null) => {
    setOperationPending(true);
    setLastError(null);
    setLastSuccess(null);
    try {
      const token = await callNextToken(serviceType);
      if (token) {
        setLastSuccess(`Called token ${token.token_number}`);
      } else {
        setLastSuccess('No waiting tokens in queue');
      }
      return token;
    } catch (err: any) {
      setLastError(err.message);
      return null;
    } finally {
      setOperationPending(false);
    }
  }, []);

  const doComplete = useCallback(async (tokenId: string) => {
    setOperationPending(true);
    setLastError(null);
    setLastSuccess(null);
    try {
      // Check if token is in 'called' state and transition through 'serving' first
      const token = await updateTokenStatus(tokenId, 'serving');
      const completed = await updateTokenStatus(tokenId, 'completed');
      setLastSuccess(`Completed token ${completed.token_number}`);
      return completed;
    } catch (err: any) {
      // If already serving, try direct complete
      try {
        const completed = await updateTokenStatus(tokenId, 'completed');
        setLastSuccess(`Completed token ${completed.token_number}`);
        return completed;
      } catch (err2: any) {
        setLastError(err2.message);
        return null;
      }
    } finally {
      setOperationPending(false);
    }
  }, []);

  const doSkip = useCallback(async (tokenId: string) => {
    setOperationPending(true);
    setLastError(null);
    setLastSuccess(null);
    try {
      const token = await updateTokenStatus(tokenId, 'skipped');
      setLastSuccess(`Skipped token ${token.token_number}`);
      return token;
    } catch (err: any) {
      setLastError(err.message);
      return null;
    } finally {
      setOperationPending(false);
    }
  }, []);

  const doWalkIn = useCallback(async (serviceType: ServiceType) => {
    setOperationPending(true);
    setLastError(null);
    setLastSuccess(null);
    try {
      const token = await createWalkInToken(serviceType);
      setLastSuccess(`Walk-in token ${token.token_number} created`);
      return token;
    } catch (err: any) {
      setLastError(err.message);
      return null;
    } finally {
      setOperationPending(false);
    }
  }, []);

  const doReset = useCallback(async () => {
    setOperationPending(true);
    setLastError(null);
    try {
      await resetTodayQueue();
      setLastSuccess('Queue reset successfully');
    } catch (err: any) {
      setLastError(err.message);
    } finally {
      setOperationPending(false);
    }
  }, []);

  return {
    operationPending,
    lastError,
    lastSuccess,
    clearMessages,
    doCallNext,
    doComplete,
    doSkip,
    doWalkIn,
    doReset,
  };
}

// ──────────────────────────────────────────────
// useETA — estimated waiting time
// ──────────────────────────────────────────────

export function useETA(serviceType: ServiceType | null, tokensAhead: number) {
  const [eta, setEta] = useState<{ estimatedMinutes: number; basedOnHistory: boolean; sampleSize: number } | null>(null);

  useEffect(() => {
    if (!serviceType || tokensAhead < 0 || !isSupabaseConfigured()) {
      setEta(null);
      return;
    }

    calculateETA(serviceType, tokensAhead).then(setEta).catch(() => setEta(null));
  }, [serviceType, tokensAhead]);

  return eta;
}

// ──────────────────────────────────────────────
// useQueuePressure
// ──────────────────────────────────────────────

export function useQueuePressure(serviceType: ServiceType | null) {
  const [pressure, setPressure] = useState<QueuePressure | null>(null);

  useEffect(() => {
    if (!serviceType || !isSupabaseConfigured()) {
      setPressure(null);
      return;
    }

    const fetchPressure = () => {
      calculateQueuePressure(serviceType).then(setPressure).catch(() => setPressure(null));
    };

    fetchPressure();
    const interval = setInterval(fetchPressure, 30000); // Update every 30s

    return () => clearInterval(interval);
  }, [serviceType]);

  return pressure;
}
