import { useState } from 'react';
import { useQueueData, useStaffActions, useQueuePressure } from '../hooks/useQueue';
import { isSupabaseConfigured } from '../lib/supabase';
import { SERVICES, type ServiceType, getServiceConfig } from '../lib/database.types';
import type { Token } from '../lib/database.types';
import StatusBadge from '../components/StatusBadge';
import TokenCard from '../components/TokenCard';
import AlertBanner from '../components/AlertBanner';
import LoadingSpinner, { InlineSpinner } from '../components/LoadingSpinner';
import {
  PhoneForwarded, CheckCircle, SkipForward, UserPlus,
  Filter, Users, Clock, TrendingUp, RotateCcw,
  Wifi, WifiOff, AlertTriangle, Activity,
} from 'lucide-react';

export default function StaffPage() {
  const { tokens, stats, loading, error, connected, refetch } = useQueueData();
  const {
    operationPending, lastError, lastSuccess, clearMessages,
    doCallNext, doComplete, doSkip, doWalkIn, doReset,
  } = useStaffActions();
  const [serviceFilter, setServiceFilter] = useState<ServiceType | 'all'>('all');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [walkInService, setWalkInService] = useState<ServiceType | null>(null);

  const pressure = useQueuePressure(serviceFilter !== 'all' ? serviceFilter : 'bonafide');

  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <AlertBanner
          type="warning"
          message="Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file."
        />
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner message="Loading staff dashboard..." />;
  }

  // Filter tokens
  const filteredTokens = tokens.filter(t =>
    serviceFilter === 'all' || t.service_type === serviceFilter
  );

  const waitingTokens = filteredTokens.filter(t => t.status === 'waiting');
  const calledTokens = filteredTokens.filter(t => t.status === 'called' || t.status === 'serving');
  const completedTokens = filteredTokens.filter(t => t.status === 'completed');
  const skippedTokens = filteredTokens.filter(t => t.status === 'skipped');

  const PressureIndicator = () => {
    if (!pressure || pressure.level === 'unknown') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg">
          <Activity className="w-3.5 h-3.5" />
          Pressure: Insufficient data
        </div>
      );
    }

    const colors = {
      normal: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      watch: 'text-amber-700 bg-amber-50 border-amber-200',
      congested: 'text-red-700 bg-red-50 border-red-200',
    };

    return (
      <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border ${colors[pressure.level]}`}>
        {pressure.level === 'congested' && <AlertTriangle className="w-3.5 h-3.5" />}
        {pressure.level === 'watch' && <TrendingUp className="w-3.5 h-3.5" />}
        {pressure.level === 'normal' && <Activity className="w-3.5 h-3.5" />}
        Queue: {pressure.level.toUpperCase()}
        {pressure.ratio !== null && ` (${pressure.ratio.toFixed(2)})`}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Manage queue tokens and service flow</p>
        </div>
        <div className="flex items-center gap-3">
          <PressureIndicator />
          <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-emerald-600' : 'text-red-500'}`}>
            {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {connected ? 'Live' : 'Offline'}
          </div>
        </div>
      </div>

      {/* Feedback messages */}
      {lastError && <AlertBanner type="error" message={lastError} onDismiss={clearMessages} />}
      {lastSuccess && <AlertBanner type="success" message={lastSuccess} onDismiss={clearMessages} />}
      {error && <AlertBanner type="error" message={error} />}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Waiting', value: stats.totalWaiting, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Serving', value: stats.totalServing, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Completed', value: stats.totalCompleted, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Today', value: stats.totalToday, color: 'text-slate-700', bg: 'bg-slate-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 border border-slate-200`}>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</p>
            <p className={`text-3xl font-bold ${color} mt-1`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Service Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400" />
        <button
          onClick={() => setServiceFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            serviceFilter === 'all'
              ? 'bg-blue-100 text-blue-700 border border-blue-200'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          All Services
        </button>
        {SERVICES.map(s => (
          <button
            key={s.id}
            onClick={() => setServiceFilter(s.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              serviceFilter === s.id
                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s.prefix} - {s.name}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left: Action Panel ── */}
        <div className="space-y-4">
          {/* Call Next */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <PhoneForwarded className="w-5 h-5 text-blue-600" />
              Call Next Token
            </h3>
            <button
              onClick={() => doCallNext(serviceFilter === 'all' ? null : serviceFilter)}
              disabled={operationPending || waitingTokens.length === 0}
              className={`w-full py-3 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-all ${
                waitingTokens.length > 0 && !operationPending
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 active:scale-[0.98]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {operationPending ? <InlineSpinner /> : <PhoneForwarded className="w-5 h-5" />}
              CALL NEXT
            </button>
            <p className="text-xs text-slate-400 mt-2 text-center">
              {waitingTokens.length} waiting in{' '}
              {serviceFilter === 'all' ? 'all queues' : getServiceConfig(serviceFilter).name}
            </p>
          </div>

          {/* Walk-in Token */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-violet-600" />
              Issue Walk-In Token
            </h3>
            <div className="space-y-2">
              <select
                value={walkInService || ''}
                onChange={(e) => setWalkInService(e.target.value as ServiceType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              >
                <option value="">Select service...</option>
                {SERVICES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={() => walkInService && doWalkIn(walkInService)}
                disabled={operationPending || !walkInService}
                className={`w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                  walkInService && !operationPending
                    ? 'bg-violet-600 hover:bg-violet-500 text-white'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {operationPending ? <InlineSpinner /> : <UserPlus className="w-4 h-4" />}
                ISSUE WALK-IN TOKEN
              </button>
            </div>
          </div>

          {/* Reset */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-red-500" />
              Reset Queue
            </h3>
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
              >
                Reset Today's Queue
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-red-600">This will delete ALL tokens for today. This cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => { await doReset(); refetch(); setShowResetConfirm(false); }}
                    disabled={operationPending}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
                  >
                    Confirm Reset
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Center: Currently Serving & Waiting ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Currently Serving */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Currently Serving ({calledTokens.length})
            </h3>
            {calledTokens.length === 0 ? (
              <div className="bg-slate-50 rounded-xl p-6 text-center border border-slate-200">
                <p className="text-sm text-slate-400">No tokens currently being served</p>
              </div>
            ) : (
              <div className="space-y-3">
                {calledTokens.map(token => (
                  <TokenCard key={token.id} token={token} showTimestamps>
                    <div className="flex gap-2">
                      <button
                        onClick={() => doComplete(token.id)}
                        disabled={operationPending}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                      >
                        {operationPending ? <InlineSpinner /> : <CheckCircle className="w-4 h-4" />}
                        COMPLETE
                      </button>
                      <button
                        onClick={() => doSkip(token.id)}
                        disabled={operationPending}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors disabled:opacity-50"
                      >
                        {operationPending ? <InlineSpinner /> : <SkipForward className="w-4 h-4" />}
                        SKIP
                      </button>
                    </div>
                  </TokenCard>
                ))}
              </div>
            )}
          </div>

          {/* Waiting Queue */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-600" />
              Waiting Queue ({waitingTokens.length})
            </h3>
            {waitingTokens.length === 0 ? (
              <div className="bg-slate-50 rounded-xl p-6 text-center border border-slate-200">
                <p className="text-sm text-slate-400">No tokens in the waiting queue</p>
              </div>
            ) : (
              <div className="space-y-2">
                {waitingTokens.map((token, idx) => (
                  <TokenCard key={token.id} token={token} compact>
                    <span className="text-xs text-slate-400 mr-2">#{idx + 1}</span>
                  </TokenCard>
                ))}
              </div>
            )}
          </div>

          {/* Skipped Tokens */}
          {skippedTokens.length > 0 && (
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <SkipForward className="w-5 h-5 text-slate-500" />
                Skipped ({skippedTokens.length})
              </h3>
              <div className="space-y-2">
                {skippedTokens.map(token => (
                  <TokenCard key={token.id} token={token} compact />
                ))}
              </div>
            </div>
          )}

          {/* Completed Today */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              Completed Today ({completedTokens.length})
            </h3>
            {completedTokens.length === 0 ? (
              <div className="bg-slate-50 rounded-xl p-6 text-center border border-slate-200">
                <p className="text-sm text-slate-400">No tokens completed yet today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {completedTokens.slice(-10).reverse().map(token => (
                  <TokenCard key={token.id} token={token} compact showService />
                ))}
                {completedTokens.length > 10 && (
                  <p className="text-xs text-slate-400 text-center">
                    Showing last 10 of {completedTokens.length} completed tokens
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
