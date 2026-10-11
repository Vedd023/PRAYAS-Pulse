import { useState } from 'react';
import { useStudentToken, useQueueData, useETA } from '../hooks/useQueue';
import { isSupabaseConfigured } from '../lib/supabase';
import type { ServiceType } from '../lib/database.types';
import { getServiceConfig } from '../lib/database.types';
import ServiceSelector from '../components/ServiceSelector';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import AlertBanner from '../components/AlertBanner';
import {
  Clock, Users, Hash, ArrowRight, AlertCircle, Wifi, WifiOff,
  CheckCircle, XCircle, Timer,
} from 'lucide-react';

export default function StudentPage() {
  const { token, loading, error, generating, createToken, cancelToken } = useStudentToken();
  const { tokens, stats, connected } = useQueueData();
  const [selectedService, setSelectedService] = useState<ServiceType | null>(null);
  const [showCancel, setShowCancel] = useState(false);

  // Calculate position and ETA
  let tokensAhead = 0;
  if (token && (token.status === 'waiting' || token.status === 'called')) {
    const sameServiceWaiting = tokens.filter(
      t => t.service_type === token.service_type &&
           t.status === 'waiting' &&
           new Date(t.created_at).getTime() < new Date(token.created_at).getTime()
    );
    tokensAhead = sameServiceWaiting.length;
    // If there's someone being served, they're not "ahead" in the wait queue
  }

  const eta = useETA(token?.service_type || null, tokensAhead);

  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <AlertBanner
          type="warning"
          message="Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file to connect to the database."
        />
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner message="Loading your queue status..." />;
  }

  // Connection indicator
  const ConnectionStatus = () => (
    <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-emerald-600' : 'text-red-500'}`}>
      {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
      {connected ? 'Live' : 'Reconnecting...'}
    </div>
  );

  // ── Active Token View ──
  if (token) {
    const service = getServiceConfig(token.service_type);
    const nowServing = tokens.find(
      t => t.service_type === token.service_type &&
           (t.status === 'called' || t.status === 'serving')
    );

    return (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Your Token</h1>
          <ConnectionStatus />
        </div>

        {error && <AlertBanner type="error" message={error} />}

        {/* Token Display */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-slide-up">
          {/* Token Number - Hero */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-8 text-center text-white">
            <p className="text-sm font-medium text-blue-200 mb-2">Token Number</p>
            <p className="text-5xl font-extrabold tracking-wider font-mono">{token.token_number}</p>
            <div className="mt-3">
              <StatusBadge status={token.status} size="lg" pulse={token.status === 'called'} />
            </div>
          </div>

          {/* Details */}
          <div className="px-6 py-5 space-y-4">
            {/* Service */}
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-500 flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Service
              </span>
              <span className="text-sm font-semibold text-slate-900">{service.name}</span>
            </div>

            {/* Now Serving */}
            <div className="flex items-center justify-between py-2 border-t border-slate-100">
              <span className="text-sm text-slate-500 flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                Now Serving
              </span>
              <span className="text-sm font-semibold text-slate-900 font-mono">
                {nowServing ? nowServing.token_number : '—'}
              </span>
            </div>

            {/* Queue Position */}
            {token.status === 'waiting' && (
              <div className="flex items-center justify-between py-2 border-t border-slate-100">
                <span className="text-sm text-slate-500 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Students Ahead
                </span>
                <span className="text-lg font-bold text-slate-900">{tokensAhead}</span>
              </div>
            )}

            {/* ETA */}
            {token.status === 'waiting' && eta && (
              <div className="flex items-center justify-between py-2 border-t border-slate-100">
                <span className="text-sm text-slate-500 flex items-center gap-2">
                  <Timer className="w-4 h-4" />
                  Est. Wait
                </span>
                <div className="text-right">
                  <span className="text-lg font-bold text-blue-600">
                    ~{eta.estimatedMinutes} min
                  </span>
                  <p className="text-xs text-slate-400">
                    {eta.basedOnHistory
                      ? `Based on ${eta.sampleSize} recent services`
                      : 'Based on default estimate'}
                  </p>
                </div>
              </div>
            )}

            {/* Called notification */}
            {token.status === 'called' && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-center animate-pulse-gentle">
                <CheckCircle className="w-8 h-8 text-violet-600 mx-auto mb-2" />
                <p className="font-bold text-violet-800 text-lg">Your token has been called!</p>
                <p className="text-sm text-violet-600 mt-1">Please proceed to the counter.</p>
              </div>
            )}

            {/* Serving */}
            {token.status === 'serving' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                <Clock className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <p className="font-bold text-blue-800 text-lg">Being served</p>
                <p className="text-sm text-blue-600 mt-1">Your request is being processed.</p>
              </div>
            )}
          </div>
        </div>

        {/* Cancel Token */}
        {(token.status === 'waiting') && (
          <div className="text-center">
            {!showCancel ? (
              <button
                onClick={() => setShowCancel(true)}
                className="text-sm text-slate-400 hover:text-red-500 transition-colors"
              >
                Cancel my token
              </button>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                <p className="text-sm text-red-700 font-medium">
                  Are you sure you want to cancel your token?
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={async () => {
                      await cancelToken();
                      setShowCancel(false);
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    Yes, Cancel
                  </button>
                  <button
                    onClick={() => setShowCancel(false)}
                    className="px-4 py-2 bg-white text-slate-700 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Keep Token
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Queue Info */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <p className="text-xs text-slate-400 text-center">
            This page updates automatically. Your token is saved — refreshing won't lose it.
          </p>
        </div>
      </div>
    );
  }

  // ── No Token — Service Selection View ──
  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Join Queue</h1>
          <p className="text-sm text-slate-500 mt-1">Select a service to get your token</p>
        </div>
        <ConnectionStatus />
      </div>

      {error && <AlertBanner type="error" message={error} />}

      {/* Service Selection */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Available Services</h2>
        <ServiceSelector
          selectedService={selectedService}
          onSelect={setSelectedService}
          disabled={generating}
        />
      </div>

      {/* Queue preview for selected service */}
      {selectedService && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 animate-fade-in">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Currently waiting</span>
            <span className="font-semibold text-slate-900">
              {stats.byService[selectedService]?.waiting ?? 0} students
            </span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-slate-500">Now serving</span>
            <span className="font-semibold text-slate-900 font-mono">
              {stats.byService[selectedService]?.currentToken?.token_number ?? '—'}
            </span>
          </div>
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={() => selectedService && createToken(selectedService)}
        disabled={!selectedService || generating}
        className={`w-full py-4 rounded-xl text-base font-semibold transition-all flex items-center justify-center gap-2 ${
          selectedService && !generating
            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
        }`}
      >
        {generating ? (
          <>
            <LoadingSpinner size="sm" message="" />
            Generating Token...
          </>
        ) : (
          <>
            Generate Token
            <ArrowRight className="w-5 h-5" />
          </>
        )}
      </button>

      <p className="text-xs text-slate-400 text-center">
        You can only hold one active token at a time.
      </p>
    </div>
  );
}
