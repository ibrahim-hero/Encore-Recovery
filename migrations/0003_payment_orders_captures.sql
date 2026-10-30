CREATE TABLE payment_orders (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  create_request_id text NOT NULL UNIQUE,
  capture_request_id text NOT NULL UNIQUE,
  create_state text NOT NULL CHECK (create_state IN
    ('CREATING','CREATED','CAPTURING','CAPTURED','UNKNOWN','CANCELLED','FAILED','EXPIRED','REVIEW_REQUIRED')),
  provider_order_id text UNIQUE,
  provider_status text,
  approve_url text,
  return_nonce_hash text NOT NULL,
  -- Immutable create body: a replay after an unknown outcome reuses it exactly.
  create_payload jsonb NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL,
  last_error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Addendum C.6: one live order per booking; cancelled/failed orders allow a retry.
CREATE UNIQUE INDEX payment_orders_one_live_per_booking
  ON payment_orders (booking_id)
  WHERE create_state NOT IN ('CANCELLED','FAILED','EXPIRED');

CREATE TABLE captures (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
  payment_order_id uuid NOT NULL UNIQUE REFERENCES payment_orders(id),
  provider_capture_id text NOT NULL UNIQUE,
  provider_order_id text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  provider_status text NOT NULL,
  payee_merchant_id text,
  verified_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
