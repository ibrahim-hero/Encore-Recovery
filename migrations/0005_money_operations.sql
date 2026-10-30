CREATE TABLE money_operations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  case_id uuid NOT NULL REFERENCES recovery_cases(id),
  capture_id uuid NOT NULL REFERENCES captures(id),
  plan_id uuid NOT NULL REFERENCES recovery_plans(id),
  kind text NOT NULL CHECK (kind = 'FULL_REFUND'),
  request_id text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL,
  state text NOT NULL CHECK (state IN
    ('QUEUED','SENDING','UNKNOWN','PROVIDER_PENDING','SUCCEEDED','REJECTED','MANUAL_REVIEW')),
  provider_refund_id text UNIQUE,
  provider_status text,
  provider_debug_id text,
  send_attempts integer NOT NULL DEFAULT 0,
  read_attempts integer NOT NULL DEFAULT 0,
  first_sent_at timestamptz,
  replay_deadline timestamptz,
  last_error jsonb,
  review_reason text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- INV-05: exactly one full-refund intent per capture, forever.
  UNIQUE (capture_id, kind)
);
