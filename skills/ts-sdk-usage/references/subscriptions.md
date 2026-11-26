# Subscriptions

```ts
suqo.subscriptions.list(params?: PageParams): Promise<SubscriptionPage<Subscription>>   // GET  /api/v1/subscriptions/
suqo.subscriptions.autoPaging(params?: PageParams): AsyncIterableIterator<Subscription>
suqo.subscriptions.retrieve(id: string): Promise<Subscription>                           // GET  /api/v1/subscriptions/{id}/          — 2.0.0+
suqo.subscriptions.create(params: CreateSubscriptionParams): Promise<CreateSubscriptionResponse>  // POST /api/v1/subscriptions/  — LEGACY
suqo.subscriptions.cancel(id: string): Promise<MessageResponse>                          // POST /api/v1/subscriptions/{id}/cancel/
suqo.subscriptions.updateBillingCycle(params: UpdateBillingCycleParams): Promise<MessageResponse>  // POST /api/v1/subscriptions/update-billing-cycle/
suqo.subscriptions.resume(id: string): Promise<MessageResponse>                          // POST /api/v1/subscriptions/{id}/resume/
suqo.subscriptions.renew(subscriptionId: string): Promise<CheckoutSessionResponse>       // POST /api/v1/subscription/renew/ (singular) — 2.0.0+
```

`retrieve(id)` exists since 2.0.0. It's built from Swagger's schema; the SDK
notes it isn't yet checked against a captured response.

## Create — legacy since 2.0.0

**Prefer `checkoutSessions.create()`** (see `checkout-sessions.md`): one
checkout for up to ten items, and no full customer object needed.
`subscriptions.create()` still works and isn't deprecated — existing
integrations keep working — but new code should use checkout sessions.

```ts
interface CreateSubscriptionParams { pbpId: string; returnUrl: string; customer: CustomerInput; }
interface CreateSubscriptionResponse {
  subscriptionId: string; pbpId: string;
  status: "pending_checkout"; checkoutUrl: string;
  nextBillingCycle: string | null; createdAt: string;
}
```

`create()` returns a `checkoutUrl` to redirect the buyer to.
**`checkoutUrl` is not proof of payment.** The subscription starts
`pending_checkout`; the real outcome arrives later via the
`checkout.succeeded`/`checkout.failed` webhooks (see `webhooks.md`) — the same
session-keyed payload checkout sessions use.

**One live recurring subscription per product.** `customer.email` identifies
the buyer. A buyer may hold only one live recurring subscription per product:
a second one on **any** billing period of the same product throws
`ValidationError` (a bare-list 400, surfaced as `err.message`). To restart an
inactive subscription, use `renew()` — not a new `create()`.

### `customer` — the field that's renamed on the wire, with an extra asymmetry

```ts
interface CustomerInput {
  phone: string; fullName: string; email: string; address: string;
  billing?: { businessName: string; email: string; address: string; panVat?: string };
  shipping?: { phone: string; fullName: string; email: string; address?: string };
}
```

The SDK calls this field `customer`; the wire calls it `client` (renamed
because `client` would collide with the SDK's own client object). Only the
**root key** is renamed — nested field names are not, with one further
wrinkle that's easy to get backwards:

- **On write**, `billing.*` fields get a `billing_` prefix
  (`businessName` → `billing_business_name`, `email` → `billing_email`,
  `address` → `billing_address`, `panVat` → `billing_pan_vat`) but
  `shipping.*` fields do **not** (`fullName` → `full_name`, not
  `shipping_full_name`).
- **On read** (the `customer` object embedded on a `Subscription`), neither
  nested object is prefixed — `business_name`, not `billing_business_name`.

This is a real backend quirk, not a bug to "fix" in generated code — write
code that matches it exactly rather than assuming symmetry. If `billing` is
omitted entirely on create, billing info is filled in server-side from the
buyer's own profile.

## Renew (2.0.0+)

```ts
const session = await suqo.subscriptions.renew("sub_…");   // CheckoutSessionResponse
session.checkoutUrl;   // send the buyer here
session.publicId;      // "cks_…" — the session_id on the checkout.* webhook
```

Opens a checkout session for the subscription's next payment, reusing its
customer and billing period (or partner-priced item) rather than resubmitting
them — **how an inactive subscription is restarted.** The id travels in the
request body (`subscription_id`) on the singular `/subscription/renew/` path.
A cancelled or archived subscription, or a paid one-time purchase, can't be
renewed: `ValidationError`.

## Cancel

`cancel(id)` **schedules** cancellation for the end of the current billing
period — it is not immediate. Status moves to `pending_cancellation`, not
straight to `cancelled`; the subscription stays active until the period ends.
Calling it on a subscription already cancelled or pending cancellation
returns it unchanged, so retrying by hand is safe.

## Update billing cycle

```ts
interface UpdateBillingCycleParams { subscriptionId: string; nextBillingCycle: string; }  // "YYYY-MM-DD"
```

This is a **collection-level** call: `subscriptionId` travels in the request
body, not the URL path — unlike `cancel`/`resume`, which are path-templated.
Easy to get backwards if you're pattern-matching off `cancel`/`resume`.
`nextBillingCycle` must be today or later.

## Resume

`resume(id)` undoes a scheduled cancellation: `pending_cancellation` →
`active`. An already-active subscription is returned unchanged. A
**`cancelled`** subscription can be neither resumed nor renewed (`renew()`
refuses it: "This subscription was cancelled and cannot be renewed.") —
sell it again with a new checkout session. The SDK's own `resume()` JSDoc
says "use `renew()`" here; that contradicts the API and the SDK's own
`renew()` doc, so don't follow it. `renew()` is for **inactive**
subscriptions (lapsed without payment), not cancelled ones.

## One-time purchases

A billing period whose `intervalType` is `"one_time"` creates a subscription
that appears in `list()` but **can't be cancelled, resumed, rescheduled or
renewed** — each throws `ValidationError` (e.g. "This is a one-time purchase,
so there is nothing to cancel."). One-time subscriptions are also left out of
`list()`'s status counts. Nothing on `Subscription` itself says whether it
recurs: match `subscription.product?.pbpId` against `products.list()` and read
that billing period's `intervalType`.

## Status

```ts
SubscriptionStatus.PendingCheckout     // "pending_checkout"
SubscriptionStatus.Active              // "active"
SubscriptionStatus.Due                 // "due"
SubscriptionStatus.Cancelled           // "cancelled"
SubscriptionStatus.PendingCancellation // "pending_cancellation"
SubscriptionStatus.Inactive            // "inactive"
```

`subscription.isActive` is `true` iff `status === "active"` — a convenience
flag, not independent state. The type stays open (`| (string & {})`, see
`api-surface.md`) so an unrecognized future status still type-checks; narrow
with `===` against a known constant and keep a fallback branch.

## Retries

None of `create`/`cancel`/`updateBillingCycle`/`resume`/`renew` retry
automatically — no idempotency-key support exists yet (see `errors.md`). A
`NetworkError` from any of these means the write may or may not have landed;
reconcile by re-reading rather than blindly resending.

`list`/`autoPaging`/`retrieve` do retry (`NetworkError`/429/5xx, with
backoff).

## Shape

```ts
interface SubscriptionProduct {        // every field string | null since 2.0.0
  productId: string | null; name: string | null; planName: string | null;
  pbpId: string | null; label: string | null; price: string | null; currency: string | null;
}
interface Subscription {
  subscriptionId: string; status: SubscriptionStatus; isActive: boolean;
  customer: SubscriptionCustomer;      // read shape — see models.md
  product: SubscriptionProduct | null;
  currentPeriodStart: string | null; currentPeriodEnd: string | null;
  nextBillingCycle: string | null; createdAt: string;
}
```

**Null-check `product` and every field on it** — the API may omit or null
any of them, and since 2.0.0 the types say so. `currentPeriodEnd` and
`nextBillingCycle` are documented as always equal — don't treat a difference
between them as meaningful. `product.price` stays a string, same decimal rule
as `products.md`.

`SubscriptionPage<T>` extends the common `Page<T>` with
`totalSubscriptions`/`activeSubscriptions`/`dueSubscriptions`/
`inactiveSubscriptions` counts — see `models.md`.

See `templates/create-subscription.ts` for a full (legacy) `create()` call
with the error ladder, and `templates/manage-subscription.ts` for
`cancel`/`updateBillingCycle`/`resume`/`renew`.
