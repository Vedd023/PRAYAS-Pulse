import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Activity, Users, Monitor, Settings, Clock, Shield, Zap,
  ArrowRight, CheckCircle, Smartphone,
} from 'lucide-react';

export default function LandingPage() {
  const studentUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/student`
    : '/student';

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.15),transparent_60%)]" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="animate-slide-up">
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-6">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-blue-300 font-medium">PRAYAS-INFO-26-S-005</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6">
                PRAYAS{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                  Pulse
                </span>
              </h1>
              <p className="text-lg md:text-xl text-slate-300 mb-4 leading-relaxed max-w-xl">
                An Adaptive and Inclusive QR-Based Digital Queue Management System
                for college administrative offices.
              </p>
              <p className="text-base text-slate-400 mb-8 max-w-lg">
                Generate digital tokens, track your queue position in real-time,
                and get estimated waiting times — no more standing in line without information.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  to="/student"
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-semibold text-base no-underline transition-colors shadow-lg shadow-blue-500/25"
                >
                  <Smartphone className="w-5 h-5" />
                  Join Queue
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/staff"
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-6 py-3 rounded-xl font-semibold text-base no-underline transition-colors border border-white/10"
                >
                  <Settings className="w-5 h-5" />
                  Staff Dashboard
                </Link>
                <Link
                  to="/display"
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-6 py-3 rounded-xl font-semibold text-base no-underline transition-colors border border-white/10"
                >
                  <Monitor className="w-5 h-5" />
                  Public Display
                </Link>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex justify-center md:justify-end animate-slide-up">
              <div className="bg-white rounded-2xl p-6 shadow-2xl shadow-black/20">
                <QRCodeSVG
                  value={studentUrl}
                  size={200}
                  level="M"
                  includeMargin={false}
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                />
                <p className="text-center text-sm text-slate-500 mt-3 font-medium">
                  Scan to join queue
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">How It Works</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">
              A transparent, digital-first approach to queue management for college administrative services.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Smartphone,
                title: '1. Get a Token',
                desc: 'Select your service and generate a digital token instantly. Works on any device or via walk-in at the counter.',
                bgClass: 'bg-blue-100',
                iconClass: 'text-blue-600',
              },
              {
                icon: Clock,
                title: '2. Track Progress',
                desc: 'See your position in real-time with estimated waiting time. Updates automatically as the queue moves.',
                bgClass: 'bg-violet-100',
                iconClass: 'text-violet-600',
              },
              {
                icon: CheckCircle,
                title: '3. Get Served',
                desc: 'Receive a notification when your token is called. Proceed to the counter and complete your task.',
                bgClass: 'bg-emerald-100',
                iconClass: 'text-emerald-600',
              },
            ].map(({ icon: Icon, title, desc, bgClass, iconClass }) => (
              <div
                key={title}
                className="bg-slate-50 rounded-2xl p-6 border border-slate-100 hover:shadow-lg transition-shadow"
              >
                <div className={`w-12 h-12 rounded-xl ${bgClass} flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${iconClass}`} />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Benefits */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Zap, label: 'Real-Time Updates', desc: 'Live queue status via Supabase Realtime' },
              { icon: Shield, label: 'Fair Ordering', desc: 'FIFO queue with transparent sequencing' },
              { icon: Users, label: 'Inclusive Access', desc: 'Walk-in tokens for those without smartphones' },
              { icon: Monitor, label: 'Public Display', desc: 'Large-screen board for office lobbies' },
            ].map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="bg-white rounded-xl p-5 border border-slate-200 text-center"
              >
                <Icon className="w-8 h-8 text-blue-600 mx-auto mb-3" />
                <h4 className="font-semibold text-slate-900 mb-1">{label}</h4>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-slate-900 text-slate-400">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-white font-semibold">PRAYAS Pulse</span>
          </div>
          <p className="text-sm">
            Built for PRAYAS-INFO-26-S-005 · Digital Queue Management System
          </p>
        </div>
      </footer>
    </div>
  );
}
