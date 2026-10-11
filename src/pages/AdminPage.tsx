import { useQueueData, useQueuePressure } from '../hooks/useQueue';
import { isSupabaseConfigured } from '../lib/supabase';
import { SERVICES, type ServiceType, getServiceConfig } from '../lib/database.types';
import LoadingSpinner from '../components/LoadingSpinner';
import AlertBanner from '../components/AlertBanner';
import {
  Activity, TrendingUp, Users, Clock, CheckCircle, AlertTriangle,
  BarChart3,
} from 'lucide-react';

export default function AdminPage() {
  const { tokens, stats, loading, error } = useQueueData();

  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <AlertBanner
          type="warning"
          message="Supabase is not configured. Please set environment variables."
        />
      </div>
    );
  }

  if (loading) return <LoadingSpinner message="Loading admin overview..." />;

  // Calculate average service time per service type
  const avgServiceTimes: Record<ServiceType, { avg: number; count: number }> = {} as any;

  for (const s of SERVICES) {
    const completedTokens = tokens.filter(
      t => t.service_type === s.id && t.status === 'completed' && t.completed_at
    );

    const durations: number[] = [];
    for (const t of completedTokens) {
      const start = t.started_at || t.called_at;
      if (start && t.completed_at) {
        const durationMin = (new Date(t.completed_at).getTime() - new Date(start).getTime()) / 60000;
        if (durationMin > 0 && durationMin < 120) {
          durations.push(durationMin);
        }
      }
    }

    avgServiceTimes[s.id] = {
      avg: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      count: durations.length,
    };
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Overview</h1>
        <p className="text-sm text-slate-500 mt-1">Summary of today's queue activity</p>
      </div>

      {error && <AlertBanner type="error" message={error} />}

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Tokens', value: stats.totalToday, icon: BarChart3, iconColor: 'text-blue-500', valColor: 'text-blue-600' },
          { label: 'Waiting', value: stats.totalWaiting, icon: Clock, iconColor: 'text-amber-500', valColor: 'text-amber-600' },
          { label: 'Serving', value: stats.totalServing, icon: Activity, iconColor: 'text-violet-500', valColor: 'text-violet-600' },
          { label: 'Completed', value: stats.totalCompleted, icon: CheckCircle, iconColor: 'text-emerald-500', valColor: 'text-emerald-600' },
          { label: 'Skipped', value: stats.totalSkipped, icon: AlertTriangle, iconColor: 'text-slate-500', valColor: 'text-slate-600' },
        ].map(({ label, value, icon: Icon, iconColor, valColor }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${iconColor}`} />
              <span className="text-xs text-slate-500 font-medium">{label}</span>
            </div>
            <p className={`text-3xl font-bold ${valColor}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Per-Service Breakdown */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Service Breakdown</h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3 font-semibold text-slate-700">Service</th>
                <th className="text-center px-3 py-3 font-semibold text-slate-700">Waiting</th>
                <th className="text-center px-3 py-3 font-semibold text-slate-700">Serving</th>
                <th className="text-center px-3 py-3 font-semibold text-slate-700">Completed</th>
                <th className="text-center px-3 py-3 font-semibold text-slate-700">Avg Time</th>
                <th className="text-center px-3 py-3 font-semibold text-slate-700">Default Est.</th>
              </tr>
            </thead>
            <tbody>
              {SERVICES.map(s => {
                const sStats = stats.byService[s.id];
                const avgTime = avgServiceTimes[s.id];
                return (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      <span className="text-slate-400 mr-2 font-mono">{s.prefix}</span>
                      {s.name}
                    </td>
                    <td className="text-center px-3 py-3">
                      <span className={`font-semibold ${sStats?.waiting > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                        {sStats?.waiting || 0}
                      </span>
                    </td>
                    <td className="text-center px-3 py-3">
                      <span className={`font-semibold ${sStats?.serving > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                        {sStats?.serving || 0}
                      </span>
                    </td>
                    <td className="text-center px-3 py-3">
                      <span className="font-semibold text-emerald-600">{sStats?.completed || 0}</span>
                    </td>
                    <td className="text-center px-3 py-3 text-slate-700">
                      {avgTime.count > 0 ? (
                        <span>{avgTime.avg.toFixed(1)} min <span className="text-slate-400 text-xs">({avgTime.count})</span></span>
                      ) : (
                        <span className="text-slate-400">No data</span>
                      )}
                    </td>
                    <td className="text-center px-3 py-3 text-slate-500">
                      {s.estimatedDurationMinutes} min
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ETA & Pressure Documentation */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
        <h3 className="font-semibold text-blue-900 mb-3">Estimation Methodology</h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>
            <strong>Waiting Time:</strong> Estimated as <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">tokens_ahead × avg_service_duration</code>.
            The average is computed from the last 20 completed tokens for the same service today.
            If fewer than 3 completed records exist, the configured default estimate is used.
          </p>
          <p>
            <strong>Queue Pressure:</strong> Calculated as <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">arrival_rate / service_rate</code> over
            a 15-minute window. Levels: Normal (&lt;0.8), Watch (0.8–1.0), Congested (≥1.0). Shown as "unknown" with fewer than 3 arrivals.
          </p>
          <p className="text-xs text-blue-600">
            These are approximations. Actual wait times depend on service complexity and are not guaranteed.
          </p>
        </div>
      </div>
    </div>
  );
}
