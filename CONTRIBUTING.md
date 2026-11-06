# Contributing

Thanks for taking a look at Encore Recovery.

## Setup

```bash
pnpm install
pnpm dev
```

No environment variables are needed for local work. The app falls back to PGlite and a fixture PayPal provider.

## Before opening a pull request

```bash
pnpm typecheck
pnpm test
```

Both run in CI on every push and pull request.

## Ground rules for money code

- Anything that decides eligibility or refund state belongs in a pure function in `lib/domain/` with unit tests.
- Never accept an amount, currency, or recipient from the client or the model.
- Any new webhook or provider status must be handled by the reducer and covered by a test, including the out-of-order case.
- Schema changes are new numbered files in `migrations/`. Do not edit an applied migration.
- Mutating routes must keep the session, CSRF, and same-origin checks and use a strict schema.

## Commits

Short, imperative subject lines (for example `Add replay window test`).
