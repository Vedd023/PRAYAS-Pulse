# PRAYAS Pulse — Architecture Documentation

**Problem Statement:** PRAYAS-INFO-26-S-005  
**Project:** PRAYAS Pulse — An Adaptive and Inclusive QR-Based Digital Queue Management System

---

## 1. System Overview

PRAYAS Pulse provides a real-time, digital queue management system designed specifically for college administrative offices (e.g., Bonafide Certificates, Fee Queries, Examination Forms, Document Verification). The system eliminates physical counter congestion by allowing students to generate tokens digitally, track their exact queue position, receive realistic waiting time estimations, and view public display boards.

```
                      ┌─────────────────────────────────────────┐
                      │             PRAYAS Pulse                │
                      └────────────────────┬────────────────────┘
                                           │
         ┌──────────────────┬──────────────┴─────┬──────────────────┐
         ▼                  ▼                    ▼                  ▼
┌─────────────────┐ ┌───────────────┐ ┌────────────────────┐ ┌───────────────┐
│  Student App    │ │  Staff Portal │ │  Public Display    │ │ Admin Insights│
│  (/student)     │ │  (/staff)     │ │  (/display)        │ │ (/admin)      │
└────────┬────────┘ └───────┬───────┘ └──────────┬─────────┘ └───────┬───────┘
         │                  │                    │                   │
         └──────────────────┼────────────────────┴───────────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │     Supabase Backend      │
              ├───────────────────────────┤
              │ • PostgreSQL Table        │
              │ • Atomic Token RPC        │
              │ • Row-Level Security      │
              │ • Supabase Realtime (WS)  │
              └───────────────────────────┘
```

---

## 2. Component Architecture

### 2.1 Route Structure & Pages
- **`/` — Landing Page:** Project overview, service definitions, problem context, and QR code linking directly to `/student`.
- **`/student` — Student Queue Interface:** Mobile-first token generation, live serving token, waiting count ahead, adaptive waiting time (ETA), and cancellation option.
- **`/staff` — Staff Dashboard:** Desktop-first management console with `CALL NEXT`, `COMPLETE`, `SKIP`, and `ISSUE WALK-IN TOKEN` operations, per-service filters, and real-time queue pressure monitor.
- **`/display` — Public Queue Display:** TV/lobby-optimized dark theme, high-contrast typography, per-service `NOW SERVING` and `NEXT UP` tokens, zero personal data exposure.
- **`/admin` — Administrative Overview:** Aggregate daily metrics, average service duration breakdowns, estimation documentation, and queue health statistics.

### 2.2 Shared Component Layer
- `Navbar.tsx`: Persistent header navigation across views (automatically hidden on `/display` for full-screen lobby monitors).
- `StatusBadge.tsx`: Color-coded badge (`waiting`, `called`, `serving`, `completed`, `skipped`, `cancelled`).
- `TokenCard.tsx`: Standardized card format for active and historical tokens.
- `ServiceSelector.tsx`: Interactive grid for service selection with estimated initial times.
- `AlertBanner.tsx`: Accessible notifications for error, warning, info, and success states.
- `LoadingSpinner.tsx`: Graceful loading feedback.

---

## 3. Data Flow & State Management

1. **Single Source of Truth:** All queue data resides in PostgreSQL on Supabase (`tokens` table).
2. **Real-time Synchronization:** Clients establish a WebSocket subscription via `supabase.channel('tokens-realtime').on('postgres_changes', ...)` to receive instant broadcasts on `INSERT`, `UPDATE`, and `DELETE`.
3. **Session Persistence:** Anonymous students are assigned a browser-persistent session ID via `localStorage.getItem('prayas_session_id') || crypto.randomUUID()`. Refreshing the student page maintains their active token without requiring college Single Sign-On (SSO).
4. **Walk-in Tokens:** Staff can issue walk-in tokens tagged with `walkin-{UUID}` for students without smartphones, inserting them into the exact same FIFO queue.

---

## 4. Token Lifecycle State Machine

The token status transitions follow a strict directed state machine:

```
                  ┌──────────┐
                  │ WAITING  │ ◄───────┐
                  └────┬─────┘         │
                       │               │
             call_next │               │ re-queue
                       ▼               │
                  ┌──────────┐         │
                  │  CALLED  ├─────────┤
                  └────┬─────┘         │
                       │               │
             start/    │               │
             serving   ▼               │
                  ┌──────────┐         │
                  │ SERVING  ├─────────┘
                  └────┬─────┘ (skip)
                       │
              complete │
                       ▼
                 ┌───────────┐
                 │ COMPLETED │ (terminal)
                 └───────────┘
```

### Allowed Transitions Table:
| From State | Allowed Target States | Enforcement |
|---|---|---|
| `waiting` | `called`, `cancelled` | Client validation (`isValidTransition`) & DB update |
| `called` | `serving`, `skipped`, `cancelled` | Client validation & DB update |
| `serving` | `completed`, `skipped` | Client validation & DB update |
| `skipped` | `waiting` (re-queue) | Client validation & DB update |
| `completed`| *(None - Terminal)* | Blocked |
| `cancelled`| *(None - Terminal)* | Blocked |

---

## 5. Token Numbering Strategy

To eliminate duplicate token numbers under concurrent requests:
1. **Format:** `{PREFIX}-{NNN}`:
   - Bonafide Certificate: `B-001`, `B-002`...
   - Fee Query: `F-001`, `F-002`...
   - Examination Form: `E-001`, `E-002`...
   - Document Verification: `D-001`, `D-002`...
   - Other Services: `O-001`, `O-002`...
2. **Atomic DB Counter:** The `generate_token(service_type, session_id)` PostgreSQL function uses an `UPSERT` on the `daily_counters` table with row locking:
   ```sql
   INSERT INTO daily_counters (service_type, date, last_number)
   VALUES (p_service_type, CURRENT_DATE, 1)
   ON CONFLICT (service_type, date)
   DO UPDATE SET last_number = daily_counters.last_number + 1
   RETURNING last_number INTO v_next_number;
   ```
3. **Daily Reset:** Counters reset each day naturally via the `date` compound key (`UNIQUE(service_type, date)`).

---

## 6. Waiting-Time Estimation (ETA) Algorithm

### 6.1 Formula
$$\text{Estimated Wait Time} = \text{Tokens Ahead} \times \text{Average Service Duration}$$

### 6.2 Data Sourcing
- **Sufficient Data ($\ge 3$ completed records today):** Uses the rolling average of observed durations:
  $$\text{Duration} = \text{completed\_at} - (\text{started\_at} \text{ or } \text{called\_at})$$
  Outliers over 120 minutes are filtered out.
- **Insufficient Data ($< 3$ records):** Falls back to the pre-configured baseline estimate for that service type (e.g., 4 minutes for Bonafide, 5 minutes for Fee Query).
- **Transparency:** The student UI explicitly states whether the estimate is based on historical records (with sample size) or default values.
- **Bounds:** Guaranteed $\ge 0$ minutes.

---

## 7. Queue Pressure Monitoring

To detect impending counter congestion before bottlenecks occur:
$$\text{Pressure Ratio} = \frac{\text{Arrival Rate}}{\text{Service Rate}} = \frac{\text{Arrivals in 15-min window}}{\text{Completions in 15-min window}}$$

### Thresholds:
- **`NORMAL`:** $\text{Ratio} < 0.8$ (counter capacity exceeds demand)
- **`WATCH`:** $0.8 \le \text{Ratio} < 1.0$ (approaching capacity)
- **`CONGESTED`:** $\text{Ratio} \ge 1.0$ (demand exceeds service output)
- **`UNKNOWN`:** Fewer than 3 arrivals in the observation window (prevents misleading false alarms).

---

## 8. Privacy & Security Architecture

1. **Student Privacy:** The public display board and student queues track only token identifiers (`B-014`). No student names, roll numbers, emails, or personal credentials are required or exposed.
2. **Access Control Boundaries:**
   - Public/Student key is the Supabase publishable anonymous key.
   - Row Level Security (RLS) is enabled on all tables.
   - MVP Limitation: Full administrative role-based authentication (RBAC) via Supabase Auth is documented as future scope; staff actions are currently UI-routed.
