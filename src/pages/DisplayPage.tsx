import { useQueueData } from '../hooks/useQueue';
import { isSupabaseConfigured } from '../lib/supabase';
import { SERVICES, getServiceConfig, type ServiceType } from '../lib/database.types';
import type { Token } from '../lib/database.types';
import LoadingSpinner from '../components/LoadingSpinner';
import { Activity, Clock, Users, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function DisplayPage() {
  const { tokens, stats, loading, error, connected } = useQueueData();
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Update the "last updated" timestamp whenever tokens change
  useEffect(() => {
    setLastUpdated(new Date());
  }, [tokens]);



  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <LoadingSpinner message="Loading queue display..." />
      </div>
    );
  }

  // Get currently serving tokens per service
  const servingByService: Record<ServiceType, Token | null> = {} as any;
  const waitingByService: Record<ServiceType, Token[]> = {} as any;

  for (const s of SERVICES) {
    const serviceTokens = tokens.filter(t => t.service_type === s.id);
    servingByService[s.id] = serviceTokens.find(t => t.status === 'called' || t.status === 'serving') || null;
    waitingByService[s.id] = serviceTokens.filter(t => t.status === 'waiting');
  }

  // Active services (have any tokens today)
  const activeServices = SERVICES.filter(s =>
    servingByService[s.id] || waitingByService[s.id].length > 0
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 md:p-8 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">PRAYAS Pulse</h1>
            <p className="text-sm text-slate-400">Queue Display Board</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className={`flex items-center gap-1.5 ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
            {connected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {connected ? 'LIVE' : 'OFFLINE'}
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <Clock className="w-4 h-4" />
            {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Main Display Grid */}
      {activeServices.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Users className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-2xl text-slate-500 font-medium">Queue is empty</p>
            <p className="text-slate-600 mt-2">No active tokens at this time</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {activeServices.map(service => {
            const serving = servingByService[service.id];
            const waiting = waitingByService[service.id];
            const nextUp = waiting.slice(0, 3);

            return (
              <div
                key={service.id}
                className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden animate-fade-in"
              >
                {/* Service Header */}
                <div className="bg-slate-800/80 px-5 py-3 border-b border-slate-700 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    {service.name}
                  </h2>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Users className="w-3.5 h-3.5" />
                    {waiting.length} waiting
                  </div>
                </div>

                {/* Now Serving */}
                <div className="px-5 py-6">
                  <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-2">
                    Now Serving
                  </p>
                  {serving ? (
                    <div className="flex items-center gap-4">
                      <span className="text-5xl md:text-6xl font-extrabold text-white font-mono tracking-wider animate-pulse-gentle">
                        {serving.token_number}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-sm text-emerald-400 font-medium">Active</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-4xl font-bold text-slate-600 font-mono">— —</span>
                  )}
                </div>

                {/* Next Up */}
                {nextUp.length > 0 && (
                  <div className="px-5 pb-5">
                    <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-2">
                      Next Up
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {nextUp.map((t, i) => (
                        <span
                          key={t.id}
                          className={`px-3 py-1.5 rounded-lg font-mono font-semibold text-sm ${
                            i === 0
                              ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20'
                              : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                          }`}
                        >
                          {t.token_number}
                        </span>
                      ))}
                      {waiting.length > 3 && (
                        <span className="px-3 py-1.5 rounded-lg text-sm text-slate-500">
                          +{waiting.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Stats */}
      <div className="mt-8 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
        <div className="flex gap-6">
          <span>Total Waiting: <strong className="text-slate-300">{stats.totalWaiting}</strong></span>
          <span>Serving: <strong className="text-slate-300">{stats.totalServing}</strong></span>
          <span>Completed Today: <strong className="text-slate-300">{stats.totalCompleted}</strong></span>
        </div>
        <p className="text-xs text-slate-600">
          No personal information displayed · Updates automatically
        </p>
      </div>
    </div>
  );
}
