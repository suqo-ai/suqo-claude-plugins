# Products

```ts
suqo.products.list(params?: PageParams): Promise<Page<Product>>       // GET /api/v1/products/
suqo.products.autoPaging(params?: PageParams): AsyncIterableIterator<Product>
```

Read-only, no create/update/delete. **Works before KYC clears** (so do
`webhooks.*` and `bankAccounts.*`) — reach for it first when a task doesn't need an authenticated
buyer yet (e.g. rendering a public pricing page).

`PageParams` is `{ page?: number; pageSize?: number }` — `pageSize` maps to
the wire's `page_size`, same as every other list call. Server default page
size is 20, server max is 100. Full pagination mechanics (manual paging for
a UI, `.autoPaging()`, and why an in-flight call can't be cancelled today)
are in `pagination.md`.

## The id chain into checkout

```
Product.plan[].billingPeriods[].pbpId
```

`pbpId` is what a catalogue item in `checkoutSessions.create({ items: [{ pbpId }] })`
takes (and the legacy `subscriptions.create({ pbpId, ... })`) — walk
`product.plan` to the plan the buyer picked, then `plan.billingPeriods` to
the billing period (monthly/yearly/etc.), and pass that period's `pbpId`
straight through. See `checkout-sessions.md`.

## Field gotchas

- **Decimal fields are strings, end to end.** `price`, `vatPercentage`, and
  `totalSubscribers` come back as strings (e.g. `"500.00"`, `"13.00"`,
  `"42"`) and stay strings — never coerce them to `number`. Use them as
  display strings or parse with a decimal-safe library if you need to do
  arithmetic.
- `vat` can be `null` (not every product has VAT configured), and since
  2.0.0 so can `vat.vatType` and `vat.vatPercentage`.
- **Since 2.0.0, `description`, `termsAndConditions`, `featuresAndBenefits`
  and `Plan.description` are `string | null`** — null-check before rendering.
- **`BillingPeriod.offers` is `Offer[]`** (was `unknown[]` before 2.0.0). An
  offer's `discountAmount` is a whole-unit **number** (rupees, not paisa) and
  is **already applied** to `price` while the offer is active — don't
  subtract it again.
- `intervalType` `"one_time"` means a single purchase: subscriptions on it
  can't be cancelled, resumed, rescheduled or renewed.
- `plan` and `billingPeriods` can legitimately come back empty — a product
  with no configured plans, or a plan with no active billing periods, is a
  valid response, not an error.

## Shape

```ts
interface ProductVat {
  isVatActive: boolean;
  vatType: "inclusive" | "exclusive" | string | null;
  vatPercentage: string | null;
}
interface ProductImage { image: string; imageOrder: number; }
interface Offer {
  id: string;
  discountAmount: number;            // whole units, already applied to price
  startsAt: string | null;           // "YYYY-MM-DD"
  validUntil: string | null;         // "YYYY-MM-DD"
  isActive: boolean;
}
interface BillingPeriod {
  pbpId: string;
  intervalType: "day" | "week" | "month" | "year" | "one_time" | string;
  intervalCount: number; label: string;
  price: string; currency: string; isCurrent: boolean; isLimited: boolean;
  isArchived: boolean; offers: Offer[];
}
interface Plan { planId: string; planName: string; description: string | null; billingPeriods: BillingPeriod[]; }
interface Product {
  productId: string; name: string; description: string | null;
  type: "simple" | "tiered" | string; isActive: boolean;
  termsAndConditions: string | null; featuresAndBenefits: string | null; vat: ProductVat | null;
  productImage: ProductImage[]; plan: Plan[]; totalSubscribers: string;
  createdAt: string; updatedAt: string;
}
```

The `"…" | string` unions above are open: known values autocomplete, a
value the API adds later still decodes. Their alias names (`IntervalType`,
`VatType`, `ProductType`) aren't exported — write the literals.

`productImage` was corrected from `string[]` to `ProductImage[]` in
`@suqo/sdk@1.1.0` — the wire has always sent image objects
(`{ image, image_order }`), never bare URLs. Upgrading from `1.0.0`, replace
`product.productImage[i]` used as a URL with `product.productImage[i].image`,
**and** replace any `image_order` access with `imageOrder` — `1.1.0` renames
the key on the way in, it's not just a type correction (confirmed against
both published builds).

Every property here is the plain camelCase of the wire's snake_case field —
no renames anywhere in this resource (`product_id` → `productId`,
`is_vat_active` → `isVatActive`, etc.). That's the common case across the
whole SDK; `models.md` has the short list of fields where that's *not* true.

See `templates/list-products.ts` for a runnable `autoPaging` walk down to
each billing period's `pbpId`.
