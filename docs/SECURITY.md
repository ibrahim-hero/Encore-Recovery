# Security and safety model

Encore Recovery moves (sandbox) money, so the design starts from what must never happen.

## Invariants

1. **Never refund twice.** One `money_operation` per booking, a stable `PayPal-Request-Id` per operation, and a partial unique index on live payment orders.
2. **Never trust the client or the model for money.** Amount, currency, and recipient come only from verified server-side records.
3. **Never mark success without proof.** `SUCCEEDED` requires a verified `COMPLETED` provider read whose amount, currency, and invoice (`ER-<operationId>`) match.
4. **Never lose an in-flight refund.** Intent is committed to the outbox before the network call; a lost response becomes `UNKNOWN` and is replayed with the same key.
5. **Never go backward.** Stale or replayed events (for example a late `PENDING`) cannot move a completed operation.
6. **Never act on a forged event.** Webhook signatures are verified before any state change.

## Threat model

| Threat | Mitigation |
| --- | --- |
| Prompt injection or hallucinated amounts from the model | The output schema has no money fields; the plan is built by deterministic rules; the model result is advisory and re-validated server-side |
| Tampered request body | Strict schemas reject unknown fields; amounts are recomputed from server records |
| CSRF | Session cookie plus double-submit CSRF token plus same-origin check on every mutation |
| Forged PayPal webhook | Signature verification against `PAYPAL_WEBHOOK_ID`; a forged event leaves no trace in operations, jobs, or audit data |
| Replayed or reordered webhook | Deduplication by provider event id and a monotonic reducer |
| Dropped network response after a refund was sent | `UNKNOWN` state, same-key replay within a bounded window, verified webhook or read to resolve |
| Concurrent approval or double click | Single transaction creates the operation and job; unique constraints and idempotent job claim |
| Plan built from outdated facts | Fact fingerprint; changed booking revision, capture, or policy makes the plan stale |
| Wrong payee | Capture payee merchant id must match the expected merchant before eligibility |
| Unauthorized job draining | The internal drain endpoint requires `INTERNAL_JOB_TOKEN` |
| Secret exposure | Credentials are read only on the server from environment variables; none are committed |

## Reporting a vulnerability

This is a sandbox-only hackathon prototype. If you find a security issue, open a private security advisory on GitHub rather than a public issue.

## Known limitations

- Sandbox only. The app should not be pointed at live PayPal credentials without a full review.
- Authentication is a demo session model, not a production identity system.
- Full refunds only; partial refunds and multi-currency cases are out of scope.
