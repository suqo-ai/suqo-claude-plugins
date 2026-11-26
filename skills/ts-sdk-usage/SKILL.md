---
name: ts-sdk-usage
description: Use for any TypeScript/Node work with the SUQO TS SDK (@suqo/sdk) — opening checkout sessions to collect payment, listing products, customers, or subscriptions, cancelling, resuming, renewing or rescheduling subscriptions, managing and verifying webhooks, requesting payouts and verifying the payout bank account by OTP, BYOP gateway credentials and fees, paging, wiring the client into Express, Fastify, Next.js, or plain Node, reading SUQO error responses, or testing code that calls the SDK. Provides exact method signatures so the SDK is never guessed at, and the raw-body rule that most broken webhook handlers get wrong.
---

# SUQO TypeScript SDK — usage

`@suqo/sdk`, server-side only — it holds a full-access API key and must never
be bundled into browser code. Node ≥18, zero runtime dependencies (`fetch`
and `node:crypto` are both built in), strict TypeScript, dual ESM/CJS build.

**Published.** `@suqo/sdk` is live on the public npm registry:
`npm i @suqo/sdk`. Releases publish via npm OIDC Trusted Publishing (no
stored npm tokens), with a required human approval before anything goes
live. **This skill documents `2.2.1`.** 2.0.0 was a breaking major (checkout
webhook payload, `customers.create()` body); code written against 1.x needs
the upgrade notes in `references/webhooks.md` and `references/customers.md`. Links: npm
<https://www.npmjs.com/package/@suqo/sdk>, repo
<https://github.com/suqo-ai/suqo-sdk-ts>, docs
<https://suqo.ai/docs/sdk> (TypeScript:
<https://suqo.ai/docs/sdk/typescript/>). See `references/client-setup.md` for
install and client construction.

## Workflow

1. **Name the task** — checkout flow, subscription dashboard, webhook
   endpoint, cancellation route, sync job.
2. **Load only the reference you need** from `references/`. Never load them
   all. `references/api-surface.md` is the authority on signatures; load it
   before writing any SDK call.
3. **Start from a template** in `templates/` when one is close, rather than
   writing from scratch.
4. **Write against documented methods only.** If a reference doesn't cover
   something, say so — do not invent a method, parameter, or property. In
   particular: there are no idempotency keys yet (so no write is ever
   retried), and no way to cancel an in-flight call.
5. **Verify** — `tsc --noEmit` against the real SDK types, then the
   project's own test/lint command. If a sandbox key is available, exercise
   the code for real; otherwise say plainly that it was only typechecked,
   not run against the API.

## The whole callable surface

| Call | Returns |
| --- | --- |
| `new SuqoClient({ apiKey, baseUrl?, timeout?, maxRetries?, dispatcher? })` | `SuqoClient` |
| `suqo.checkoutSessions.create(params)` / `.retrieve(id)` | `CheckoutSessionResponse` / `CheckoutSession` |
| `suqo.products.list(params?)` / `.autoPaging(params?)` | `Page<Product>` / iterator |
| `suqo.subscriptions.list(params?)` / `.autoPaging(params?)` | `SubscriptionPage<Subscription>` / iterator |
| `suqo.subscriptions.retrieve(id)` | `Subscription` |
| `suqo.subscriptions.create(params)` — legacy | `CreateSubscriptionResponse` |
| `suqo.subscriptions.cancel(id)` / `.resume(id)` / `.updateBillingCycle(params)` | `MessageResponse` |
| `suqo.subscriptions.renew(subscriptionId)` | `CheckoutSessionResponse` |
| `suqo.customers.list(params?)` / `.autoPaging()` / `.retrieve(id)` | `Page<Customer>` / iterator / `Customer` |
| `suqo.customers.create(params)` / `.update(id, params)` | `Customer` |
| `suqo.webhooks.list()` / `.retrieve(id)` | `Webhook[]` / `Webhook` |
| `suqo.webhooks.create(params)` / `.replace(id, params)` / `.update(id, params)` | `Webhook` |
| `suqo.webhooks.delete(id)` / `.testDelivery(id)` | `void` |
| `suqo.webhooks.retrieveSecret()` | `WebhookSecret` |
| `suqo.webhooks.verify(options)` | `boolean` (never throws, no network) |
| `suqo.payouts.list(params?)` / `.autoPaging()` / `.retrieve(payoutId)` | `Page<Payout>` / iterator / `Payout` |
| `suqo.payouts.create()` | `Payout` |
| `suqo.bankAccounts.list()` / `.retrieve(id)` | `BankAccount[]` / `BankAccount` |
| `suqo.bankAccounts.create(params)` / `.update(id, { code, … })` | `BankAccount` |
| `suqo.bankAccounts.delete(id)` / `.sendOtp(id)` | `void` |
| `suqo.byop.listPaymentMethods()` | `PaymentMethod[]` |
| `suqo.byop.replaceCredentials(paymentMethodId, credentials)` | `void` |
| `suqo.byop.updateProcessingFee(paymentMethodId, { processingFee })` | `ByopFee` |
| `mapHttpError(input)` | `SuqoError` |

Everything above is the complete surface — `references/api-surface.md` has
exact signatures and lists what's deliberately *not* exported (internal
client/auth stubs, the HTTP layer, the `*Resource` classes, every
`serialize*`/`deserialize*` helper).

## Rules that trip people up

Apply these without being asked — most bugs against this SDK are one of them.

- **Collect payment with `checkoutSessions.create()`**, not the legacy
  `subscriptions.create()`. Neither `checkoutUrl` nor the buyer landing on
  `returnUrl` is proof of payment — wait for `checkout.succeeded`, matched on
  `session_id` (= the session's `publicId`).
- **Checkout webhooks are per session, not per subscription** (2.0.0+): no
  top-level `subscription_id`; each `line_items[]` entry carries the
  `subscription_id` it paid for. See `references/webhooks.md`.
- **Decimal fields are strings.** `price`, `vatPercentage`, `totalSubscribers`,
  every amount (payout amounts included). Never coerce to `number`. The one
  number is `Offer.discountAmount`, already applied to `price`.
- **`customer` on the SDK is `client` on the wire** — renamed because
  `client` collides with the SDK's own client object. Only the root key is
  renamed; nested `billing.*` fields get a `billing_` wire prefix on write,
  `shipping.*` fields don't, and neither is prefixed on read. See
  `references/subscriptions.md` — this is the single easiest field-mapping
  mistake in the SDK.
- **Trailing slash is mandatory** on every route the SDK calls — the SDK
  handles this for you, but don't hand-build a URL to bypass it.
- **Writes never auto-retry** — every `create`/`update`/`replace`/`delete`/
  `cancel`/`resume`/`renew`/`updateBillingCycle`/`testDelivery`/`sendOtp`/
  `replaceCredentials`/`updateProcessingFee`, regardless of `maxRetries`. No
  idempotency-key support exists yet. A `NetworkError` from a write means it
  may or may not have landed; reconcile by re-reading, don't resend blindly.
- **Five calls are rate-limited** (`RateLimitError`, `retryAfter` in ms):
  `checkoutSessions.create()` (20/min per account), `bankAccounts.update()`/
  `.sendOtp()`, `byop.replaceCredentials()`/`.updateProcessingFee()`.
- **`ValidationError` normalizes three 400 shapes** — field-keyed
  (`fieldErrors`), `detail`-shaped and bare-list (`message` only). Payout and
  bank-account refusals put a reason in `err.rawBody.code` (no typed
  `err.code`). See `references/errors.md`.
- **A 403 is two different errors** (2.0.0+): `KycRequiredError` only when
  the body has `status_code`; otherwise `PermissionDeniedError`.
- **`customers.create()` requires `email`** (2.0.0+; `phone` is optional).
- **Ids are opaque strings** (`cus_…`, `cks_…`, `whk_…`, `PYT-…`) — **except
  `BankAccount.id`, a `number`.**
- **The bank-account OTP `code` is a string**, exactly as typed — never a
  number (a leading zero would be lost). A person reads it from email; adding
  an account doesn't send one — call `sendOtp()`.
- **BYOP types need 2.2.1.** `PaymentMethod`/`ByopCredentials`/
  `UpdateByopFeeParams`/`ByopFee` aren't importable on 2.2.0.

## Webhooks

`suqo.webhooks.verify()` needs no network call and the API key plays no role
in verification — but it's still a method on an already-constructed
`SuqoClient` (there's no standalone export for it). **Never throws**; every
failure mode returns `false`. The `secret` is the `signingSecret` from
`suqo.webhooks.retrieveSecret()`; registrations themselves are managed with
`suqo.webhooks.create()`/`list()`/`update()`/… (see `references/webhooks.md`).

```ts
const secret = process.env.SUQO_WEBHOOK_SECRET;
// verify() itself handles a missing secret fine (returns false, doesn't throw) — check it
// explicitly anyway so a misconfigured deployment gets a distinct, loud signal instead of
// blending into ordinary bad-signature noise.
if (!secret) throw new Error("SUQO_WEBHOOK_SECRET is not set");

const signature = req.header("x-suqo-signature");
const timestamp = req.header("x-suqo-timestamp");
if (!signature || !timestamp) throw new Error("Missing signature/timestamp header"); // 400 and stop, in real code

const verified = suqo.webhooks.verify({
  rawBody,                                          // the exact bytes received — see below
  signature,
  timestamp,
  secret,
  toleranceSec: 300,                                // optional, default 300
});
```

### Pass the raw bytes

A body re-serialized from a parse verifies only by luck. Per framework:

```ts
// Express: express.raw() scoped to just this route, never mounted globally
router.post("/webhooks/suqo", express.raw({ type: "application/json" }), handler);

// Next.js App Router
const rawBody = await req.text();

// Fastify: no drop-in equivalent — override addContentTypeParser() inside
// this route's own plugin scope (fastify.register(...)), not on the root
// instance, or every other route loses JSON parsing too.

// Plain Node — buffer the chunks yourself before parsing anything
```

### Handler checklist

1. Read the raw body **first**, before any parsing.
2. Verify, and on `false` return `400` and stop. Don't parse, don't process.
3. Parse only after verifying — in its own try/catch. A verified signature
   proves the bytes came from SUQO, not that they're valid JSON; on plain
   `http.ServerResponse` this genuinely crashes the process if the 2xx
   already went out and the parse failure reaches a handler that tries to
   send a second response (confirmed, not hypothetical — see
   `references/webhooks.md`).
4. Return `2xx` fast, then process out of band — a slow handler gets
   retried and duplicated. **On a serverless/edge runtime** (Vercel, Lambda,
   ...) that pattern is unsafe: the function can be frozen the instant the
   response is sent, silently dropping unawaited work — `await` the
   processing there instead, or use the platform's own keep-alive
   (`after()`, `waitUntil`). See `templates/webhook-nextjs-route.ts`.
5. Be idempotent — key `checkout.*` on `session_id`,
   `subscription.status_changed` on `subscription_id` + `changed_at`,
   `api_key.*` on `api_key_id` + `event`. No event has a field literally
   named `id`. Redelivery is normal; there's no replay store. Grant access
   per checkout line item, by its `subscription_id`.
6. Never echo the body back, and never treat a field inside it as an
   authorization decision on its own — verification confirms it came from
   SUQO, not that its contents are safe to act on blindly.

Exact signed-payload format, the event type catalogue (stays snake_case on
purpose), and the dashboard's test-event quirk are in
`references/webhooks.md`.

## Reference index

| Reference | Load when |
| --- | --- |
| `references/api-surface.md` | Writing any SDK call — exact signatures, exports, and what's deliberately not public. Load first. |
| `references/client-setup.md` | Constructing the client, installing from npm, environment inference, framework wiring. |
| `references/checkout-sessions.md` | Collecting payment: catalogue vs partner-priced items, `customerId`, rate limit, reading a session back. |
| `references/products.md` | Listing products/plans/offers, the pbpId chain into checkout. |
| `references/subscriptions.md` | Retrieve, legacy create, cancel, resume, renew, billing-cycle; one-time purchases; the customer/client wire rename. |
| `references/customers.md` | The customers resource; `email` required since 2.0.0; the `1.1.0` id-type fix. |
| `references/webhooks.md` | Verification, signed-payload format, event payloads (the 2.0.0 checkout reshape), managing registrations and the signing secret. |
| `references/payouts.md` | Requesting and tracking payouts; refusal codes. |
| `references/bank-accounts.md` | Adding the payout bank account and verifying it by emailed OTP. |
| `references/byop.md` | Bring-your-own-payment: payment methods, gateway credentials, processing fee. |
| `references/errors.md` | Error hierarchy (incl. `PermissionDeniedError`), the three 400 shapes, rate limits, retry rules, mapping to HTTP responses. |
| `references/models.md` | Property tables for every model, and the short list of wire↔SDK renames. |
| `references/pagination.md` | Manual `page`/`pageSize` vs `.autoPaging()`, and why an in-flight call can't be cancelled today. |

## Templates index

| Template | Use for |
| --- | --- |
| `templates/suqo-client.ts` | Lazy, guarded singleton client factory. |
| `templates/list-products.ts` | `autoPaging` read down to a billing period's `pbpId`. |
| `templates/list-products-paged.ts` | Manual `page`/`pageSize` for a Next/Previous UI control. |
| `templates/list-customers.ts` | `list`/`retrieve` on the real (not stub) customers resource. |
| `templates/create-checkout-session.ts` | `checkoutSessions.create()` with both item kinds, plus its error handling. |
| `templates/request-payout.ts` | Bank account add → `sendOtp` → verify, then `payouts.create()` with refusal codes. |
| `templates/subscription-error-handling.ts` | The shared write error ladder used by both templates below. |
| `templates/create-subscription.ts` | Full nested (legacy) `subscriptions.create()`. |
| `templates/manage-subscription.ts` | `cancel`/`updateBillingCycle`/`resume`/`renew`. |
| `templates/webhook-plain-node.ts` | No-framework webhook endpoint. |
| `templates/webhook-express.ts` | Express route with `express.raw()` scoped correctly. |
| `templates/webhook-fastify.ts` | Fastify route with a plugin-scoped raw-body parser. |
| `templates/webhook-nextjs-route.ts` | Next.js App Router route handler. |
| `templates/subscription-write.test.ts` | Vitest test for a write, stubbing `fetch` directly. |

## Testing SDK code

Stub the global `fetch`, the same way the SDK's own test suite does
(`test/http/HttpClient.test.ts`) — no extra dependency needed:

```ts
import { vi } from "vitest";

vi.stubGlobal("fetch", vi.fn());
vi.mocked(fetch).mockResolvedValueOnce(
  new Response(JSON.stringify({ /* wire-shaped body */ }), { status: 201 }),
);
```

Every layer above the network — the auth header, retry/backoff, error
mapping, pagination — still runs for real; only the raw `Response` is faked.
`msw` is the route/URL-level alternative the SDK's own `test/contract/`
suite uses.

**Don't reach for `SuqoClientOptions.dispatcher` for this**, even though
it's a real, documented option forwarded into every `fetch()` call. Passing
a `MockAgent`/`MockPool` from a separately npm-installed `undici` package as
that per-call `dispatcher` is not reliably recognized by Node's *built-in*
global `fetch` — confirmed here to silently fall through to a real network
attempt (and hang) rather than intercept, since the two are different
module realms. `undici`'s own `setGlobalDispatcher(mockAgent)` (not the
per-call option) is cross-realm-safe if you want that layer specifically,
but `vi.stubGlobal` is simpler and needs nothing extra installed.

## Notes for maintainers

Update the Reference index and Templates index tables above whenever a
file is added to `references/` or `templates/` — this skill's own history
has already drifted out of sync with itself more than once from a table
edit getting missed.

Never mock `SuqoClient` or a resource directly — mocking the thing under
test tests the mock instead of the integration, the same rule PHP's skill
holds to for `HttpClientInterface`.
