# Checkout sessions (`@suqo/sdk` 2.0.0+)

`suqo.checkoutSessions` — two operations, `create` and `retrieve`. Signatures
in `api-surface.md`. **The recommended way to collect payment**: one checkout
for one to ten items, replacing the legacy `subscriptions.create()`.

## Opening a session

```ts
const session = await suqo.checkoutSessions.create({
  items: [
    { pbpId: "pbp_…" },                                                  // catalogue item
    { name: "Setup fee", amount: "500.00", intervalType: "one_time", intervalCount: 0 }, // partner-priced
  ],
  returnUrl: "https://shop.example.com/thanks",
  customerId: "cus_…",   // optional
});

session.publicId;     // "cks_…" — store it against your order
session.checkoutUrl;  // send the buyer here
session.expiresAt;    // ~30 minutes out; kept as sent (may carry +05:45)
```

Returns `CheckoutSessionResponse` — the same type `subscriptions.renew()`
returns.

### Items: catalogue **or** partner-priced, never a mix

`CheckoutItemInput = CatalogueItemInput | PartnerPricedItemInput`:

| Shape | Fields | Price comes from |
| --- | --- | --- |
| `CatalogueItemInput` | `pbpId` only | The billing period (`products.list()` → `plan[].billingPeriods[].pbpId`) |
| `PartnerPricedItemInput` | `name`, `amount`, `intervalType`, `intervalCount` | You |

The other shape's fields are typed `never`, so mixing them is a **compile
error**, not an API 400.

- `amount` is a decimal **string** (`"2500.00"`), never a number, and must
  already include any discount — SUQO charges it as sent.
- `intervalType`: `"day"`, `"week"`, `"month"`, `"year"` or `"one_time"`.
  `intervalCount` ranges: 1–1095 day, 1–156 week, 1–36 month, 1–3 year;
  **must be `0`** for `one_time`.
- One to ten items. If two items resolve to the same product (two billing
  periods of one product), **only the last is kept, silently**.
- Prices are snapshotted when the session opens — editing the plan later
  can't change what the buyer was shown.

### `customerId`

A `cus_…` already on your account (`customers.create()`). With it, the buyer
goes straight to payment and can't edit their details. Without it, the buyer
enters full name, email, phone and address at checkout.

### Not proof of payment

Neither `checkoutUrl` nor the buyer landing back on `returnUrl` means they
paid. The outcome is a `checkout.succeeded` / `checkout.failed` webhook
whose `session_id` equals this `publicId` — see `webhooks.md`. Each line item
on that event carries the `subscription_id` it paid for.

## Rate limit

`create()` is rate-limited: **20 sessions a minute per account**. Past that
it throws `RateLimitError` with `retryAfter` (milliseconds). It's a write, so
the SDK never retries it — open a session when the buyer commits to paying,
not on page load, and back off yourself:

```ts
import { RateLimitError, type CreateCheckoutSessionParams } from "@suqo/sdk";

async function openSession(params: CreateCheckoutSessionParams) {
  try {
    return await suqo.checkoutSessions.create(params);
  } catch (err) {
    if (!(err instanceof RateLimitError)) throw err;
    await new Promise((r) => setTimeout(r, err.retryAfter ?? 5_000));
    return suqo.checkoutSessions.create(params);   // one retry; a second 429 propagates
  }
}
```

## Reading a session back

```ts
const s = await suqo.checkoutSessions.retrieve("cks_…");
s.lineItems;      // CheckoutLineItem[]
s.customerId;     // string | null
s.sellerDetails;  // CheckoutSeller — its phone is personal data; don't log it
s.sessionType;    // "subscription" | "billing" | any newer string | null
```

**Only an open session can be read.** Once paid or expired — or if the id is
unknown or someone else's — `retrieve()` throws `NotFoundError`. That's the
normal end of a session's life, not necessarily a bug; don't poll it to learn
whether a payment went through. Use the webhooks.

`CheckoutLineItem` (camelCase here, unlike the snake_case webhook payload):
`name`, `amount`, `pbpId` (`null` for partner-priced), `currency`, `vatType`,
`vatPercentage`, `discountAmount`, `intervalType`, `intervalCount`,
`displayLabel`, `currentPeriodEnd`, `extendsTo`, `nextPaymentDue`,
`imageUrls?` (catalogue only), `planName?` (partner-priced only), and
`subscriptionId?` (2.1.0+ — the subscription that line pays for; absent only
on sessions created before the API added it).

Start from `templates/create-checkout-session.ts`.
