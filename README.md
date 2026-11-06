# Encore Recovery

A merchant-side refund-recovery prototype built on the PayPal Sandbox. When a merchant cannot deliver a paid booking, Encore Recovery diagnoses the case with AI, proposes a full refund, and executes it only after a human approves, with money-movement safety guarantees.

## How it works

1. A customer books and pays through PayPal Sandbox. The capture is verified server-side.
2. The merchant marks the booking as unfulfillable. This creates a recovery case.
3. An AI diagnosis (AI SDK) reads a server-built snapshot of the booking, policy, and payment. Its output is schema-validated. It may cite evidence but can never set an amount, recipient, or URL.
4. Deterministic eligibility rules build the refund plan. The plan is bound to a fingerprint of the facts it was built from, so any change makes it stale.
5. The merchant approves. A durable outbox job sends the refund with an idempotent request ID.
6. Provider responses and verified webhooks are reduced to a final state and an evidence receipt.

## Safety guarantees

- Amounts always come from verified server-side records, never from the client or the model.
- Refunds are sent once per operation using a stable `PayPal-Request-Id`. A lost response becomes `UNKNOWN`, which is visible and recoverable by replay or by a verified webhook.
- Webhooks are signature-verified before any state change. Forged events leave no trace in operations, jobs, or audit data.
- Mutations require a session cookie, a CSRF double-submit token, and a same-origin check. Request bodies use strict schemas that reject extra fields.
- Stale events (for example a late `PENDING` after completion) cannot move a completed operation backward.

## Stack

Next.js 16, pnpm, plain `pg` with SQL migrations (no ORM), Neon Postgres, a durable outbox worker, AG Studio widgets on `/recovery`, and the AI SDK via Vercel AI Gateway (default `openai/gpt-5-mini`, fallback `google/gemini-2.5-flash`).

Without a database or PayPal credentials the app falls back to in-process PGlite and a fixture PayPal provider, so everything runs locally with no setup.

## Running locally

```bash
pnpm install
pnpm dev
```

Open `/demo` to book, pay, fail the booking, and recover it. Open `/recovery` for the AG Studio dashboard.

With real services, set `DATABASE_URL`, `APP_MODE=sandbox`, the `PAYPAL_*` credentials, and `PAYPAL_WEBHOOK_ID`, then run `pnpm db:migrate`. Register `https://<your-domain>/api/webhooks/paypal` in the PayPal Sandbox app for the refund events. The queue is drained by the client-driven `/api/jobs/tick`, or by `pnpm worker`.

## Tests

```bash
pnpm test              # all
pnpm test:unit         # eligibility, reducer, money, AI contract
pnpm test:integration  # payment, recovery, interruption, and security paths
```

The suite covers the full money path and the failure cases: dropped responses, a refund the database never recorded, replayed and out-of-order webhooks, forged signatures, CSRF and origin attacks, and tampered inputs.
