# Models — property reference

Property names and types on every response/params record, as published in
`@suqo/sdk@2.2.1`. For the handful of fields where the SDK name differs from
the wire, both are given; everywhere else, assume plain camelCase of the
wire's snake_case (`product_id` → `productId`) and it's correct.

## Renames — the short, complete list

| Wire | SDK | Why |
| --- | --- | --- |
| `client` (top-level, on create/read) | `customer` | Collides with the SDK's own client object. **Only the root key** — nested fields under it keep their own wire-derived names (see the billing/shipping asymmetry in `subscriptions.md`). |
| `Message` (schema name) | `MessageResponse` | Collides with `SuqoError.message`. |
| `*Request` (schema names, e.g. `CreateSubscriptionRequest`) | `*Params` (`CreateSubscriptionParams`) | "Request" reads as an HTTP request object, which it isn't. |
| `PaginationEnvelope` (schema name) | `Page` | Shorter, and matches what every list call actually returns. |

Everything else is plain camelCase. Webhook event payloads are the exception
in the other direction — they stay snake_case (see `webhooks.md`).

## Open unions

Several string fields are typed as their known values **or** any string, so a
value the API adds later still decodes: `Product.type`,
`BillingPeriod.intervalType`, `ProductVat.vatType`,
`CheckoutSession.sessionType`, `Webhook.event`, `Payout.status`,
`PaymentMethod.paymentType`, and `Subscription.status`. Only
`SubscriptionStatus` is exported (as a constant object + type); the other
aliases aren't — write the literals.

## `Product` / `Plan` / `BillingPeriod` / `Offer`

```ts
interface ProductVat { isVatActive: boolean; vatType: "inclusive" | "exclusive" | string | null; vatPercentage: string | null; }
interface ProductImage { image: string; imageOrder: number; }
interface Offer { id: string; discountAmount: number; startsAt: string | null; validUntil: string | null; isActive: boolean; }
interface BillingPeriod {
  pbpId: string; intervalType: "day" | "week" | "month" | "year" | "one_time" | string;
  intervalCount: number; label: string; price: string; currency: string;
  isCurrent: boolean; isLimited: boolean; isArchived: boolean; offers: Offer[];
}
interface Plan { planId: string; planName: string; description: string | null; billingPeriods: BillingPeriod[]; }
interface Product {
  productId: string; name: string; description: string | null; type: "simple" | "tiered" | string;
  isActive: boolean; termsAndConditions: string | null; featuresAndBenefits: string | null;
  vat: ProductVat | null; productImage: ProductImage[]; plan: Plan[]; totalSubscribers: string;
  createdAt: string; updatedAt: string;
}
```

`price`, `vatPercentage`, `totalSubscribers` — strings, never coerced.
`Offer.discountAmount` is a whole-unit number already applied to `price`.
Upgrade notes for `productImage` (`1.1.0`) and the nullable fields (`2.0.0`)
are in `products.md`.

## `Subscription` and its nested types

```ts
interface SubscriptionProduct {   // every field nullable since 2.0.0
  productId: string | null; name: string | null; planName: string | null; pbpId: string | null;
  label: string | null; price: string | null; currency: string | null;
}
interface SubscriptionCustomerBilling { businessName?: string; email?: string; address?: string; panVat?: string; }
interface SubscriptionCustomerShipping { phone?: string; fullName?: string; email?: string; address?: string; }
interface SubscriptionCustomer {   // the READ shape — embedded on a Subscription
  phone?: string; fullName?: string; email?: string; address?: string;
  billing?: SubscriptionCustomerBilling | null;
  shipping?: SubscriptionCustomerShipping | null;
}
interface Subscription {
  subscriptionId: string; status: SubscriptionStatus; isActive: boolean;
  customer: SubscriptionCustomer; product: SubscriptionProduct | null;
  currentPeriodStart: string | null; currentPeriodEnd: string | null;
  nextBillingCycle: string | null; createdAt: string;
}
```

On this **read** shape, `SubscriptionCustomerBilling`/`Shipping` fields carry
no `billing_`/`shipping_` wire prefix — that prefix only exists on the
**write** side (`CustomerInput`, below). See `subscriptions.md`.

## `CustomerInput` — the WRITE shape, passed to `subscriptions.create`

```ts
interface CustomerInputBilling { businessName: string; email: string; address: string; panVat?: string; }
interface CustomerInputShipping { phone: string; fullName: string; email: string; address?: string; }
interface CustomerInput {
  phone: string; fullName: string; email: string; address: string;
  billing?: CustomerInputBilling; shipping?: CustomerInputShipping;
}
```

Wire-renamed as `client` at the top level only; `billing.*` fields get a
`billing_` wire prefix, `shipping.*` fields don't.

## `Customer` — the standalone `customers` resource's own shape

```ts
interface Customer {
  id: string;   // "cus_…" — not a UUID, not an integer
  buyerPhone: string | null; buyerEmail: string | null; fullName: string | null;
  address: string | null; createdAt: string;
}
interface CreateCustomerParams { email: string; phone?: string; fullName?: string; address?: string; }  // email required since 2.0.0
interface UpdateCustomerParams { fullName?: string; email?: string; address?: string; }
```

Distinct from `SubscriptionCustomer` above — do not conflate the two. See
`customers.md`.

## Subscription write shapes

```ts
interface CreateSubscriptionParams { pbpId: string; returnUrl: string; customer: CustomerInput; }
interface CreateSubscriptionResponse {
  subscriptionId: string; pbpId: string; status: "pending_checkout";
  checkoutUrl: string; nextBillingCycle: string | null; createdAt: string;
}
interface UpdateBillingCycleParams { subscriptionId: string; nextBillingCycle: string; }
interface MessageResponse { message: string; }   // cancel, updateBillingCycle, resume
```

## Checkout sessions (2.0.0+)

```ts
interface CatalogueItemInput { pbpId: string; name?: never; amount?: never; intervalType?: never; intervalCount?: never; }
interface PartnerPricedItemInput {
  name: string; amount: string;                       // decimal string, discount already included
  intervalType: "day" | "week" | "month" | "year" | "one_time" | string;
  intervalCount: number;                              // 0 for one_time
  pbpId?: never;
}
type CheckoutItemInput = CatalogueItemInput | PartnerPricedItemInput;
interface CreateCheckoutSessionParams { items: CheckoutItemInput[]; returnUrl: string; customerId?: string; }
interface CheckoutSessionResponse { publicId: string; expiresAt: string; checkoutUrl: string; }  // also what subscriptions.renew() returns

interface CheckoutLineItem {
  name: string; amount: string; pbpId: string | null; currency: string;
  vatType: string | null; vatPercentage: string | null; discountAmount: string | null;
  intervalType: string; intervalCount: number; displayLabel: string;
  currentPeriodEnd: string | null; extendsTo: string | null; nextPaymentDue: string | null;
  imageUrls?: string[]; planName?: string | null;
  subscriptionId?: string;            // 2.1.0+
}
interface CheckoutSeller { id: string; phone: string; businessLogo: string | null; businessName: string; }
interface CheckoutSession {
  publicId: string; lineItems: CheckoutLineItem[]; customerId: string | null;
  sellerDetails: CheckoutSeller; returnUrl: string; expiresAt: string;
  completedAt: string | null; isExpired: boolean;
  sessionType: "subscription" | "billing" | string | null;
}
```

## Webhook registrations (2.0.0+)

```ts
interface Webhook { id: string; event: WebhookEventType | string; endpointUrl: string; isActive: boolean; createdAt: string; }
interface CreateWebhookParams  { event: WebhookEventType | string; endpointUrl: string; isActive?: boolean; }
interface ReplaceWebhookParams { event: WebhookEventType | string; endpointUrl: string; isActive?: boolean; }
interface UpdateWebhookParams  { event?: WebhookEventType | string; endpointUrl?: string; isActive?: boolean; }
interface WebhookSecret { signingSecret: string; }
```

## Payouts and bank accounts (2.2.0+)

```ts
interface Payout {
  payoutId: string; status: "PENDING" | "COMPLETED" | string;
  amount: string; providerCharge: string; suqoPlatformFee: string; smsCharge: string; netAmount: string;
  requestedDate: string; paidDate: string | null; receiptUrl: string | null;
}
interface BankAccount {
  id: number;                         // the one integer id in the SDK
  bankName: string; accountName: string; branch: string;
  accountNumberMasked: string;        // full number until verified
  verifiedAt: string | null; createdAt: string; updatedAt: string;
}
interface CreateBankAccountParams { bankName: string; accountName: string; accountNumber: string; branch: string; }
interface UpdateBankAccountParams { code: string; bankName?: string; accountName?: string; accountNumber?: string; branch?: string; }
```

## BYOP (2.2.0+; types exported from 2.2.1)

```ts
interface PaymentMethod {
  companyId: string; paymentTypeId: string;
  paymentType: "esewa" | "esewa_intent" | "khalti" | "nps" | "connectips" | "fonepay-checkout" | string;
  alias: string | null; logo: string | null; order: number; isActive: boolean;
  fee: string | null; isConfigured: boolean; isVerified: boolean | null;
}
type ByopCredentials = { paymentType: "esewa" | "esewa_intent"; productCode: string; merchantSecret: string } | /* … per gateway, see byop.md */;
interface UpdateByopFeeParams { processingFee: string | null; }
interface ByopFee { processingFee: string | null; }
```

## `Page<T>` / `SubscriptionPage<T>`

```ts
interface Page<T> { count: number; next: string | null; previous: string | null; results: T[]; }
type SubscriptionPage<T> = Page<T> & {
  totalSubscriptions: number; activeSubscriptions: number;
  dueSubscriptions: number; inactiveSubscriptions: number;
};
```

## `WebhookEvent` union

Stays snake_case — see `webhooks.md` for the full type definitions and why.

```ts
type WebhookEvent =
  | CheckoutSucceededEvent | CheckoutFailedEvent
  | SubscriptionStatusChangedEvent
  | ApiKeyCreatedEvent | ApiKeyDeletedEvent | ApiKeyExpiredEvent | ApiKeyExpiringSoonEvent;
```
