# SUQO TypeScript SDK — exact API surface

Every exported signature, verbatim, as published in `@suqo/sdk@2.2.1`'s
`dist/index.d.ts` — the SDK's own entry point calls itself "the single,
complete public export surface... Nothing outside this file's exports is part
of the public contract." If something is not here, it does not exist — say so
rather than inventing it.

Package `@suqo/sdk`, ESM + CJS, `strict` TypeScript, Node ≥18. Published on
npm — see `client-setup.md` for install.

## `SuqoClient`

```ts
interface SuqoClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;     // ms, default 30_000
  maxRetries?: number;  // default 2 (3 attempts total, reads only)
  dispatcher?: unknown; // undici Dispatcher — forwarded into every fetch() call verbatim
}

class SuqoClient {
  readonly products: ProductsResource;
  readonly subscriptions: SubscriptionsResource;
  readonly customers: CustomersResource;
  readonly checkoutSessions: CheckoutSessionsResource;   // 2.0.0+
  readonly webhooks: WebhooksResource;
  readonly payouts: PayoutsResource;                     // 2.2.0+
  readonly bankAccounts: BankAccountsResource;           // 2.2.0+
  readonly byop: ByopResource;                           // 2.2.0+

  constructor(options: SuqoClientOptions)   // throws SuqoConfigError

  get environment(): SuqoEnvironment;       // "sandbox" | "live"
  get baseUrl(): string;
  get timeout(): number;
  get maxRetries(): number;

  toJSON(): Record<string, unknown>;        // redacts apiKey as "[redacted]"
}
```

The eight resource properties are the only way to reach a resource — no
`*Resource` class is exported, so none can be imported or constructed
directly. All eight share the one client's HTTP layer (same key, base URL,
timeout and retry settings).

**Every read** (`list`, `autoPaging`, `retrieve`, `retrieveSecret`,
`listPaymentMethods`) retries on `NetworkError`/429/5xx up to `maxRetries`.
**Every write** (`create`, `update`, `replace`, `delete`, `cancel`,
`updateBillingCycle`, `resume`, `renew`, `testDelivery`, `sendOtp`,
`replaceCredentials`, `updateProcessingFee`) is **never** retried, whatever
`maxRetries` says — no idempotency keys exist yet.

Every id-taking method rejects an empty, `"."` or `".."` id with
`SuqoConfigError` before any request (2.0.0+); the webhook methods also
reject `"secret"`, and the bank-account methods reject anything that isn't a
positive integer.

## `suqo.products`

```ts
list(params?: PageParams): Promise<Page<Product>>       // GET /api/v1/products/
autoPaging(params?: PageParams): AsyncIterableIterator<Product>
```

Read-only. The only resource that works pre-KYC. No create/update/delete.

## `suqo.subscriptions`

```ts
list(params?: PageParams): Promise<SubscriptionPage<Subscription>>            // GET  /api/v1/subscriptions/
autoPaging(params?: PageParams): AsyncIterableIterator<Subscription>
retrieve(id: string): Promise<Subscription>                                    // GET  /api/v1/subscriptions/{id}/           — 2.0.0+
create(params: CreateSubscriptionParams): Promise<CreateSubscriptionResponse>  // POST /api/v1/subscriptions/                — LEGACY
cancel(id: string): Promise<MessageResponse>                                   // POST /api/v1/subscriptions/{id}/cancel/
updateBillingCycle(params: UpdateBillingCycleParams): Promise<MessageResponse> // POST /api/v1/subscriptions/update-billing-cycle/
resume(id: string): Promise<MessageResponse>                                   // POST /api/v1/subscriptions/{id}/resume/
renew(subscriptionId: string): Promise<CheckoutSessionResponse>                // POST /api/v1/subscription/renew/  (singular) — 2.0.0+
```

- `create()` is **legacy** since 2.0.0 — prefer `checkoutSessions.create()`.
  Still supported, not deprecated. A buyer may hold one live recurring
  subscription per product; a second on any billing period of the same
  product throws `ValidationError`.
- `retrieve()` is built from Swagger's schema; the SDK notes it isn't yet
  checked against a captured response.
- `renew()` opens a checkout session for the next payment, reusing the
  subscription's customer and billing period — how an inactive subscription
  is restarted. The id travels in the body (`subscription_id`), not the path.
- `updateBillingCycle` is collection-level too: the id is in the body.
- One-time purchases (`intervalType: "one_time"`) appear in `list()` but
  can't be cancelled, resumed, rescheduled or renewed — `ValidationError`.

Detail in `subscriptions.md`.

## `suqo.customers`

```ts
list(params?: PageParams): Promise<Page<Customer>>                  // GET   /api/v1/customers/
autoPaging(params?: PageParams): AsyncIterableIterator<Customer>
retrieve(id: string): Promise<Customer>                              // GET   /api/v1/customers/{id}/ — "cus_…" string
create(params: CreateCustomerParams): Promise<Customer>              // POST  /api/v1/customers/  — upsert
update(id: string, params: UpdateCustomerParams): Promise<Customer>  // PATCH /api/v1/customers/{id}/
```

No `delete`. `create()` requires `email` (2.0.0+; `phone` is optional) and is
an upsert. Detail in `customers.md`.

## `suqo.checkoutSessions` (2.0.0+)

```ts
create(params: CreateCheckoutSessionParams): Promise<CheckoutSessionResponse>  // POST /api/v1/checkout-sessions/
retrieve(id: string): Promise<CheckoutSession>                                  // GET  /api/v1/checkout-sessions/{id}/
```

The recommended way to collect payment. `create()` is rate-limited (20 a
minute per account). `retrieve()` only serves an **open** session — paid,
expired, unknown or someone else's throws `NotFoundError`. Detail in
`checkout-sessions.md`.

## `suqo.webhooks`

```ts
// Management (2.0.0+) — network calls
list(): Promise<Webhook[]>                                       // GET    /api/v1/webhooks/ — not paginated
create(params: CreateWebhookParams): Promise<Webhook>            // POST   /api/v1/webhooks/
retrieve(id: string): Promise<Webhook>                           // GET    /api/v1/webhooks/{id}/
replace(id: string, params: ReplaceWebhookParams): Promise<Webhook>  // PUT  /api/v1/webhooks/{id}/ — full overwrite
update(id: string, params: UpdateWebhookParams): Promise<Webhook>    // PATCH /api/v1/webhooks/{id}/ — partial
delete(id: string): Promise<void>                                // DELETE /api/v1/webhooks/{id}/
retrieveSecret(): Promise<WebhookSecret>                         // GET    /api/v1/webhooks/secret/
testDelivery(id: string): Promise<void>                          // POST   /api/v1/webhooks/{id}/test-delivery/

// Verification — no network call
interface VerifyWebhookOptions {
  rawBody: string | Buffer;
  signature: string;      // "X-SUQO-Signature" header, e.g. "sha256=<hex>"
  timestamp: string;      // "X-SUQO-Timestamp" header, Unix seconds as a string
  secret: string;         // the signingSecret from retrieveSecret()
  toleranceSec?: number;  // default 300
}
verify(options: VerifyWebhookOptions): boolean   // never throws
```

`verify()` makes no network call and the API key plays no role in it — but
it's still a method on a constructed `SuqoClient`. Every failure mode returns
`false`. The two halves meet at `retrieveSecret()`, whose `signingSecret` is
what `verify()` takes.

Event payload types, for after `verify()` returns `true` and you
`JSON.parse(rawBody)` yourself: `WebhookEvent` (the union),
`WebhookEventType`, `CheckoutSucceededEvent`, `CheckoutFailedEvent`,
`SubscriptionStatusChangedEvent`, `ApiKeyCreatedEvent`, `ApiKeyDeletedEvent`,
`ApiKeyExpiredEvent`, `ApiKeyExpiringSoonEvent`. Full shapes and the
management resource in `webhooks.md`.

## `suqo.payouts` (2.2.0+)

```ts
list(params?: PageParams): Promise<Page<Payout>>            // GET  /api/v1/payouts/ — newest first
autoPaging(params?: PageParams): AsyncIterableIterator<Payout>
create(): Promise<Payout>                                    // POST /api/v1/payouts/ — no arguments, no body
retrieve(payoutId: string): Promise<Payout>                  // GET  /api/v1/payouts/{payoutId}/ — "PYT-…"
```

`create()` needs a verified bank account. A refusal is a `ValidationError`
with the reason in `err.rawBody.code`. Detail in `payouts.md`.

## `suqo.bankAccounts` (2.2.0+)

```ts
list(): Promise<BankAccount[]>                                          // GET    /api/v1/bank-accounts/ — not paginated
create(params: CreateBankAccountParams): Promise<BankAccount>          // POST   /api/v1/bank-accounts/ — starts unverified
retrieve(id: number): Promise<BankAccount>                              // GET    /api/v1/bank-accounts/{id}/
update(id: number, params: UpdateBankAccountParams): Promise<BankAccount>  // PATCH /api/v1/bank-accounts/{id}/ — verifies with the OTP
delete(id: number): Promise<void>                                       // DELETE /api/v1/bank-accounts/{id}/
sendOtp(id: number): Promise<void>                                      // POST   /api/v1/bank-accounts/{id}/send-otp/
```

`id` is a **number** — the one integer id in the SDK. `update()` always needs
the emailed `code` (a string). `update()` and `sendOtp()` are rate-limited.
Detail in `bank-accounts.md`.

## `suqo.byop` (2.2.0+)

```ts
listPaymentMethods(): Promise<PaymentMethod[]>                                          // GET   /api/v1/byop/payment-methods/ — not paginated
replaceCredentials(paymentMethodId: string, credentials: ByopCredentials): Promise<void>  // PATCH /api/v1/byop/credentials/{id}/ — full replace
updateProcessingFee(paymentMethodId: string, params: UpdateByopFeeParams): Promise<ByopFee> // PATCH /api/v1/byop/fees/{id}/
```

The two writes throw `PermissionDeniedError` until SUQO switches the account
to BYOP, and both are rate-limited. **The four BYOP types (`PaymentMethod`,
`ByopCredentials`, `UpdateByopFeeParams`, `ByopFee`) are importable from
`@suqo/sdk` only from 2.2.1** — 2.2.0 shipped the methods without exporting
them. Detail in `byop.md`.

## Rate limits

Five calls are rate-limited and throw `RateLimitError` (with `retryAfter` in
ms) past the limit: `checkoutSessions.create()` (20 a minute per account),
`bankAccounts.update()`, `bankAccounts.sendOtp()`, `byop.replaceCredentials()`
and `byop.updateProcessingFee()` (limits not published). All five are writes,
so none is retried for you. The SDK's own JSDoc still calls checkout-session
create "the API's one rate-limited endpoint" — that line predates 2.2.0.

## `mapHttpError`

```ts
interface HttpErrorInput {
  status: number;
  statusText?: string;
  body?: unknown;
  requestId?: string;
  retryAfter?: number;
}

function mapHttpError(input: HttpErrorInput): SuqoError
```

The single status→error-class mapper every resource call routes through
internally. Exported for anyone building a custom transport around the same
rules. Full hierarchy in `errors.md`.

## Pagination helpers

```ts
interface Page<T> { count: number; next: string | null; previous: string | null; results: T[]; }
interface PageParams { page?: number; pageSize?: number; }   // pageSize -> wire page_size
type SubscriptionPage<T> = Page<T> & {
  totalSubscriptions: number; activeSubscriptions: number;
  dueSubscriptions: number; inactiveSubscriptions: number;
};

function toPageQuery(params?: PageParams): QueryParams
function deserializePage<TWireItem, T>(wire: Page<TWireItem>, deserializeItem: (item: TWireItem) => T): Page<T>
function listAll<T>(firstPage: Page<T>, fetchNext: (nextUrl: string) => Promise<Page<T>>, maxPages?: number): AsyncIterableIterator<T>
function bridgeAutoPaging<T>(fetchFirstPage: () => Promise<Page<T>>, fetchNext: (nextUrl: string) => Promise<Page<T>>, maxPages?: number): AsyncIterableIterator<T>
```

Paginated: products, subscriptions, customers, payouts. **Not** paginated
(a bare array): `webhooks.list()`, `bankAccounts.list()`,
`byop.listPaymentMethods()`. Full detail in `pagination.md`.

## `VERSION`

```ts
const VERSION: string;   // the installed package version, e.g. "2.2.1"
```

## Enums / unions

```ts
const SubscriptionStatus = {
  PendingCheckout: "pending_checkout", Active: "active", Due: "due",
  Cancelled: "cancelled", PendingCancellation: "pending_cancellation", Inactive: "inactive",
} as const;
type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus] | (string & {});
```

The trailing `| (string & {})` is deliberate — it keeps the union open so a
status added server-side still type-checks, while autocomplete still suggests
the six known literals. Narrow with strict `===` against
`SubscriptionStatus.Active` etc., and always keep a fallback branch.

The same "known values or any string" pattern types `Product.type`,
`BillingPeriod.intervalType`, `ProductVat.vatType`,
`CheckoutSession.sessionType`, `Webhook.event`, `Payout.status`
(`"PENDING" | "COMPLETED"`) and `PaymentMethod.paymentType` — but their alias
names (`IntervalType`, `PayoutStatus`, `PaymentType`, …) are **not exported**.
Write the literals; don't import the alias.

Full model property lists are in `models.md`; the full error hierarchy is in
`errors.md`; webhook event payload types are in `webhooks.md`.

## Not public — don't reach for these

Never exported from the package entry point. None of this is part of the
contract; don't import it into generated code and don't document behavior
based on it.

- `src/client/index.ts` and `src/auth/index.ts` — dead stubs (`export {}`).
  The real client is the sibling file `src/client.ts`. Authentication is one
  inline `Authorization: Bearer <apiKey>` header inside the internal HTTP
  layer; there's no auth module, no token refresh.
- `HttpClient`, `SdkConfig` and everything under `src/http/` and
  `src/config/` — internal.
- Every `serialize*`/`deserialize*` helper in a resource file — exported
  there only for the SDK's own unit tests.
- Every `*Resource` class.
