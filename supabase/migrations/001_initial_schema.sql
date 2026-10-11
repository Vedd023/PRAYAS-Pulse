-- ============================================================
-- PRAYAS Pulse — Database Schema
-- Run this in Supabase SQL Editor (or as a migration)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────
-- Tokens Table
-- ──────────────────────────────────────────────
-- Central table storing all queue tokens.
-- Each row represents one student's position in a service queue.

CREATE TABLE IF NOT EXISTS tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_number    TEXT NOT NULL,
  service_type    TEXT NOT NULL CHECK (service_type IN ('bonafide', 'fee_query', 'examination', 'document_verification', 'other')),
  status          TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'called', 'serving', 'completed', 'skipped', 'cancelled')),
  counter_number  INTEGER,
  session_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  called_at       TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens (status);
CREATE INDEX IF NOT EXISTS idx_tokens_service_type ON tokens (service_type);
CREATE INDEX IF NOT EXISTS idx_tokens_session_id ON tokens (session_id);
CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens (created_at);
CREATE INDEX IF NOT EXISTS idx_tokens_service_status ON tokens (service_type, status, created_at);

-- ──────────────────────────────────────────────
-- Daily Counters Table
-- ──────────────────────────────────────────────
-- Tracks the last-issued token number per service per day.
-- Used by generate_token() to atomically assign sequential numbers.

CREATE TABLE IF NOT EXISTS daily_counters (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_type    TEXT NOT NULL,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  last_number     INTEGER NOT NULL DEFAULT 0,
  UNIQUE(service_type, date)
);

-- ──────────────────────────────────────────────
-- Token Generation Function (Atomic)
-- ──────────────────────────────────────────────
-- Atomically generates a sequential token number using UPSERT
-- on the daily_counters table. Prevents duplicate numbers even
-- under concurrent requests.
--
-- Token format: {PREFIX}-{NNN}
--   B-001 = Bonafide
--   F-001 = Fee Query
--   E-001 = Examination Form
--   D-001 = Document Verification
--   O-001 = Other
--
-- Numbering resets daily (each day starts from 001).

CREATE OR REPLACE FUNCTION generate_token(
  p_service_type TEXT,
  p_session_id TEXT
)
RETURNS SETOF tokens
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_next_number INTEGER;
  v_token_number TEXT;
  v_token_id UUID;
BEGIN
  -- Check if session already has an active token
  IF EXISTS (
    SELECT 1 FROM tokens
    WHERE session_id = p_session_id
      AND status IN ('waiting', 'called', 'serving')
  ) THEN
    RETURN QUERY
      SELECT * FROM tokens
      WHERE session_id = p_session_id
        AND status IN ('waiting', 'called', 'serving')
      ORDER BY created_at DESC
      LIMIT 1;
    RETURN;
  END IF;

  -- Determine prefix
  v_prefix := CASE p_service_type
    WHEN 'bonafide' THEN 'B'
    WHEN 'fee_query' THEN 'F'
    WHEN 'examination' THEN 'E'
    WHEN 'document_verification' THEN 'D'
    WHEN 'other' THEN 'O'
    ELSE 'X'
  END;

  -- Atomically increment the daily counter
  INSERT INTO daily_counters (service_type, date, last_number)
  VALUES (p_service_type, CURRENT_DATE, 1)
  ON CONFLICT (service_type, date)
  DO UPDATE SET last_number = daily_counters.last_number + 1
  RETURNING last_number INTO v_next_number;

  -- Format token number
  v_token_number := v_prefix || '-' || LPAD(v_next_number::TEXT, 3, '0');

  -- Insert the token
  INSERT INTO tokens (token_number, service_type, status, session_id)
  VALUES (v_token_number, p_service_type, 'waiting', p_session_id)
  RETURNING id INTO v_token_id;

  -- Return the created token
  RETURN QUERY SELECT * FROM tokens WHERE id = v_token_id;
END;
$$;

-- ──────────────────────────────────────────────
-- Row Level Security (RLS)
-- ──────────────────────────────────────────────
-- Enable RLS on the tokens table.
-- For the MVP, we use permissive policies that allow the anon key
-- to read all tokens and insert/update tokens.
--
-- SECURITY LIMITATION: This MVP does not implement full
-- authentication. Staff operations are protected only by
-- the application UI, not by database-level authorization.
-- A production system should use Supabase Auth with role-based
-- policies.

ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_counters ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read all tokens (needed for display & student pages)
CREATE POLICY "Allow read access to tokens"
  ON tokens FOR SELECT
  USING (true);

-- Allow anonymous users to insert tokens (for token generation)
CREATE POLICY "Allow insert tokens"
  ON tokens FOR INSERT
  WITH CHECK (true);

-- Allow anonymous users to update tokens (for staff actions via anon key)
-- LIMITATION: In production, this should be restricted to authenticated staff users.
CREATE POLICY "Allow update tokens"
  ON tokens FOR UPDATE
  USING (true);

-- Allow anonymous users to delete tokens (for queue reset)
-- LIMITATION: In production, this should be restricted to admin users.
CREATE POLICY "Allow delete tokens"
  ON tokens FOR DELETE
  USING (true);

-- Daily counters policies
CREATE POLICY "Allow read daily_counters"
  ON daily_counters FOR SELECT
  USING (true);

CREATE POLICY "Allow insert daily_counters"
  ON daily_counters FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update daily_counters"
  ON daily_counters FOR UPDATE
  USING (true);

-- ──────────────────────────────────────────────
-- Enable Realtime
-- ──────────────────────────────────────────────
-- Add the tokens table to the Supabase Realtime publication
-- so that changes are broadcast to connected clients.

ALTER PUBLICATION supabase_realtime ADD TABLE tokens;

-- ──────────────────────────────────────────────
-- Status Transitions Documentation
-- ──────────────────────────────────────────────
-- Allowed transitions:
--   waiting   → called, cancelled
--   called    → serving, skipped, cancelled
--   serving   → completed, skipped
--   completed → (terminal)
--   skipped   → waiting (re-queue)
--   cancelled → (terminal)
--
-- These are enforced in the application layer (src/lib/database.types.ts).
-- A production system should also enforce them via database triggers or
-- CHECK constraints.
