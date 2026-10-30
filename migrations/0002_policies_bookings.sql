CREATE TABLE merchant_policies (
  id text PRIMARY KEY,
  version text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE booking_templates (
  slug text PRIMARY KEY,
  title text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  sort_order integer NOT NULL DEFAULT 0
);

CREATE SEQUENCE booking_code_seq START 1042;

CREATE TABLE bookings (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  code text NOT NULL UNIQUE,
  template_slug text NOT NULL REFERENCES booking_templates(slug),
  title text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  policy_id text NOT NULL REFERENCES merchant_policies(id),
  -- Capture workflow (plan section 11). Raw provider status lives on captures.
  payment_state text NOT NULL DEFAULT 'NOT_STARTED' CHECK (payment_state IN
    ('NOT_STARTED','AWAITING_BUYER','CAPTURING','UNKNOWN','PENDING','COMPLETED','FAILED','REVIEW_REQUIRED')),
  fulfillment_state text NOT NULL DEFAULT 'SCHEDULED' CHECK (fulfillment_state IN
    ('SCHEDULED','UNFULFILLABLE','CLOSED')),
  fulfillment_reason text,
  fulfillment_simulated boolean NOT NULL DEFAULT false,
  fulfillment_confirmed_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bookings_workspace_idx ON bookings (workspace_id, created_at DESC);
