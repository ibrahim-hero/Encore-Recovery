CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  booking_id uuid REFERENCES bookings(id),
  case_id uuid REFERENCES recovery_cases(id),
  type text NOT NULL,
  source text NOT NULL CHECK (source IN ('PAYPAL','MERCHANT','AI','OPERATOR','SYSTEM')),
  summary text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Immutable truth-card snapshot used by read-only replay (INV-10).
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_booking_idx ON audit_events (booking_id, created_at);

CREATE TABLE evidence_receipts (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  case_id uuid NOT NULL REFERENCES recovery_cases(id),
  version integer NOT NULL,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, version)
);
