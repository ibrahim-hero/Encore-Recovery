CREATE TABLE recovery_cases (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
  state text NOT NULL CHECK (state IN
    ('OPEN','ANALYZING','NEEDS_INFORMATION','READY','EXECUTING','VERIFYING','RESOLVED_REFUNDED','REVIEW_REQUIRED')),
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recovery_cases_workspace_idx ON recovery_cases (workspace_id, updated_at DESC);

CREATE TABLE analyses (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  case_id uuid NOT NULL REFERENCES recovery_cases(id),
  state text NOT NULL CHECK (state IN ('QUEUED','RUNNING','SUCCEEDED','FAILED')),
  model text NOT NULL,
  snapshot jsonb,
  output jsonb,
  error_code text,
  error_message text,
  repair_attempted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX analyses_case_idx ON analyses (case_id, created_at DESC);

CREATE TABLE recovery_plans (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  case_id uuid NOT NULL REFERENCES recovery_cases(id),
  analysis_id uuid NOT NULL REFERENCES analyses(id),
  state text NOT NULL CHECK (state IN ('READY','CONSUMED','STALE','EXPIRED')),
  disposition text NOT NULL CHECK (disposition = 'PROPOSE_FULL_REFUND'),
  capture_id uuid NOT NULL REFERENCES captures(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL,
  booking_revision integer NOT NULL,
  policy_id text NOT NULL REFERENCES merchant_policies(id),
  fingerprint text NOT NULL,
  summary text NOT NULL,
  reason_codes jsonb NOT NULL,
  evidence jsonb NOT NULL,
  customer_message text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

CREATE INDEX recovery_plans_case_idx ON recovery_plans (case_id, created_at DESC);
