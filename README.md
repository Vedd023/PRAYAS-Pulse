# PRAYAS Pulse — Adaptive & Inclusive QR-Based Digital Queue Management System

> **Problem Statement ID:** PRAYAS-INFO-26-S-005  
> **Target Environment:** College Administrative Counters (Bonafide Certificates, Fee Queries, Exam Forms, Document Verification)

---

## 1. Project Overview

College administrative offices frequently experience crowded counters, unclear queue statuses, and student anxiety regarding wait times. **PRAYAS Pulse** is a digital-first, accessible queue management prototype that delivers:
- Real-time queue transparency for students via mobile web.
- Instant token dispatch and calling for counter staff.
- High-contrast, large-format lobby display for waiting areas.
- Transparent waiting-time estimation (ETA) based on recent service durations.
- Real-time queue pressure monitoring to detect counter congestion early.
- Full accessibility for students without smartphones through physical walk-in token issuance.

---

## 2. Implemented Features

### 🎓 Student Interface (`/student`)
- **Interactive Service Selection:** Choose between Bonafide Certificate, Fee Query, Examination Form, Document Verification, and Other Services.
- **Unique Token Generation:** Atomic, collision-resistant token numbers (e.g., `B-001`, `F-002`).
- **Real-Time Queue Tracking:** Displays current serving token, exact count of eligible students ahead, and token status (`Waiting`, `Called`, `Serving`, `Completed`).
- **Explainable Waiting-Time Estimation (ETA):** Calculates approximate waiting time using rolling averages of completed service durations (distinguishing observed history from default estimates).
- **Persistent Session:** Tokens are tied to the device's session; page refreshes preserve active queue positions.
- **Self-Service Cancellation:** Option to cancel waiting tokens if no longer needed.

### 👔 Staff Dashboard (`/staff`)
- **Live Queue Management:** View waiting, called, skipped, and completed tokens in real time.
- **One-Click Actions:** `CALL NEXT`, `COMPLETE`, and `SKIP` with optimistic UI feedback and button guarding.
- **Walk-In Token Creation:** Generate tokens directly for students arriving without smartphones.
- **Per-Service Queue Filtering:** Toggle between all queues or specific service counters.
- **Live Queue Pressure Indicator:** Monitors arrival rate vs service rate over a 15-minute window (`NORMAL`, `WATCH`, `CONGESTED`).
- **Emergency / Demo Queue Reset:** Safe one-click reset with confirmation dialog for live demonstrations.

### 📺 Public Display Board (`/display`)
- **Lobby-Optimized Display:** High-contrast dark theme designed for wall-mounted TV screens or tablets.
- **Per-Service Status:** Prominent `NOW SERVING` token number and next eligible tokens (`Next Up`).
- **Student Privacy:** Zero personal identifying information (no names, roll numbers, or contact details displayed).
- **Zero-Touch Live Updates:** Automatically updates as staff call and complete tokens via Supabase Realtime WebSockets.

### 📊 Admin Overview (`/admin`)
- **Daily Queue Metrics:** Summary of total tokens issued, waiting, serving, completed, and skipped.
- **Service Duration Analytics:** Table showing average service times per category vs configured defaults.
- **Estimation Methodology Transparency:** Clear explanations of ETA and pressure formulas.

---

## 3. Technology Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide React icons, `qrcode.react`.
- **Backend & Database:** Supabase (Hosted PostgreSQL, Row-Level Security, Database Functions/RPC).
- **Live Synchronization:** Supabase Realtime (WebSockets / Postgres change events).
- **Testing:** Vitest v4 (19 unit & integration tests).

---

## 4. Prerequisites

- **Node.js:** v18.0.0 or higher
- **npm:** v9.0.0 or higher
- **Supabase Account:** Free project at [supabase.com](https://supabase.com) (or self-hosted PostgreSQL).

---

## 5. Quickstart & Installation

```bash
# 1. Clone or navigate to the repository
cd PRAYAS_PULSE

# 2. Install dependencies
npm install

# 3. Configure environment variables (see below)
cp .env.example .env.local

# 4. Run database setup (see Database Setup section)

# 5. Start development server
npm run dev
```

The application will be accessible at `http://localhost:5173`.

---

## 6. Environment Variables

Create a file named `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
```

Both variables can be obtained from your Supabase Project Settings $\to$ **API**.

---

## 7. Database Setup

1. Open your [Supabase Dashboard](https://app.supabase.com) and navigate to the **SQL Editor**.
2. Open the migration file: `supabase/migrations/001_initial_schema.sql`.
3. Paste the contents into the SQL Editor and click **Run**.
4. This script sets up:
   - `tokens` table with status lifecycle constraints and indexes.
   - `daily_counters` table for atomic sequential numbers.
   - `generate_token(p_service_type, p_session_id)` PostgreSQL function with conflict-safe `UPSERT`.
   - Row-Level Security (RLS) policies.
   - Realtime publication on `tokens`.

---

## 8. Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the Vite development server at `http://localhost:5173` |
| `npm run build` | Compiles TypeScript and builds the production bundle in `dist/` |
| `npm run preview` | Previews the production build locally |
| `npm test` | Runs the automated Vitest test suite (19 tests) |

---

## 9. Deployment Instructions (Vercel)

1. Push your repository to GitHub or GitLab.
2. Sign in to [Vercel](https://vercel.com) and import the repository.
3. Configure Environment Variables in Vercel:
   - `VITE_SUPABASE_URL`: Your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase Anonymous Key
4. Set Build Settings:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Click **Deploy**.

---

## 10. Known Limitations & Future Scope

1. **Role-Based Authentication (RBAC):** In this MVP, staff and admin views are secured via client-side routing rather than university Single Sign-On (SSO). Full role-based database policies via Supabase Auth are documented for production.
2. **Single Serving Counter per Service:** The MVP assigns one counter stream per service type. Multi-counter load balancing and dynamic window routing are designed for Phase 2.
3. **SMS / WhatsApp Alerts:** Notifications currently occur in-browser via WebSockets. SMS/WhatsApp gateways require external paid APIs, which are omitted to keep the prototype zero-cost and lightweight.
4. **ETA Bounds:** Wait times are statistical rolling approximations and are explicitly marked as estimates, not guarantees.
