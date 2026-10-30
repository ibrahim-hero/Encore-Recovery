CREATE TABLE webhook_events (
  id uuid PRIMARY KEY,
  provider_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  resource_id text,
  -- Restricted: never selected by UI projections.
  raw_body text NOT NULL,
  verification_status text NOT NULL CHECK (verification_status IN ('VERIFIED','FAILED')),
  processing_result text NOT NULL DEFAULT 'RECEIVED',
  workspace_id uuid REFERENCES workspaces(id),
  correlated_ref text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE outbox_jobs (
  id uuid PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id),
  type text NOT NULL CHECK (type IN ('EXECUTE_REFUND','RUN_ANALYSIS')),
  payload jsonb NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'READY' CHECK (state IN ('READY','LEASED','DONE','DEAD')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 60,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_jobs_ready_idx ON outbox_jobs (available_at) WHERE state IN ('READY','LEASED');

CREATE TABLE worker_heartbeats (
  worker_id text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  jobs_processed integer NOT NULL DEFAULT 0
);

-- Fixture-mode provider store (realistic fake PayPal). Unused in sandbox mode.
CREATE TABLE fixture_provider_objects (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('order','capture','refund','request')),
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE armed_faults (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  case_id uuid NOT NULL REFERENCES recovery_cases(id),
  fault text NOT NULL CHECK (fault = 'DROP_REFUND_RESPONSE'),
  armed_at timestamptz NOT NULL DEFAULT now(),
  triggered_at timestamptz,
  UNIQUE (case_id, fault)
);
