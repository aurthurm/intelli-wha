# Intelli-Wha

Intelli-Wha is a WhatsApp-first conversational commerce platform for sellers who need sales content, captions, posters, and later short video clips directly inside chat.

The first use case is a seller studio: a seller uploads a product image, the agent asks missing design and sales questions, then workers generate draft/final assets and deliver them back over WhatsApp or Telegram.

## Stack

- TypeScript monorepo with pnpm and Turborepo
- Baileys WhatsApp gateway
- Grammy Telegram gateway
- Fastify API for health checks and future webhooks/dashboard
- BullMQ + Redis for long-running media jobs
- Drizzle ORM + Postgres
- Sharp for deterministic layout/rendering
- Provider-based AI adapters for chat, vision, background removal, image editing, and video

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm check
```

Run services:

```bash
pnpm --filter @intelli-wha/worker dev
pnpm --filter @intelli-wha/whatsapp-bot dev
pnpm --filter @intelli-wha/telegram-bot dev
pnpm --filter @intelli-wha/api dev
```

WhatsApp requires scanning the Baileys QR on first run.

## Architecture

```text
Chat adapters
  -> Conversation runtime
  -> Use-case agent module
  -> Tools and queue jobs
  -> AI/media workers
  -> Storage and chat delivery
```

The runtime is generic. The first installed agent is `seller-studio`.

## Admin API security

Set `ADMIN_API_TOKEN` in the API process environment to a strong random secret. Send it as `Authorization: Bearer <token>` for every `/admin/*` request. Missing/blank configuration disables admin access (503); missing/incorrect credentials return 401 before database access. This is an operator-wide token with cross-tenant read access, not tenant-user authorization. Keep the API behind TLS and restrict network access. `/health` and `/health/db` remain unauthenticated; the latter still requires database connectivity.

## Delivery queue transition and identity

Delivery producers route to `delivery-telegram` or `delivery-whatsapp`. Each bot consumes only its own queue and rejects mismatched payloads. The old `delivery` queue is deliberately not consumed: before rollout, stop old consumers and reconcile/requeue legacy jobs by their validated message channel (check for already-delivered messages to avoid duplicates). Coordinate producer/worker versions; do not run old unscoped workers alongside the new release.

Conversation state is scoped by tenant, channel, chat, and sender contact; contact memory is scoped by tenant, channel, and sender. Missing tenant IDs use the explicit default tenant; supplied IDs are preserved and must refer to an existing tenant. Generation jobs require sender identity and preserve tenant association. Adapters currently omit tenant IDs, so deployments needing multiple tenants must assign trusted tenant identity at ingress. Legacy null-tenant/unowned records are not adopted automatically; review/backfill them separately. Existing schema uniqueness constraints must be present; no production migration is included here.

## Verification scope / remaining release gates

Use `pnpm check --force`, `pnpm test --force`, and `pnpm build --force` to bypass Turbo caches. Safety regressions use mocked database/queue boundaries and Fastify injection, not live bots or an end-to-end environment.

This is **not a complete photo-to-final-pack product**. Photo ingestion/byte retention, actual final generation, final asset persistence and final delivery remain incomplete. Approval is accepted only as an unambiguous standalone command; correction messages request another preview. The workflow still needs durable preview completion/version tracking before approval can prove that the seller saw the exact completed preview. Real Postgres/Redis concurrency, delivery retry/idempotency and both channel integrations need isolated integration testing before deployment.
