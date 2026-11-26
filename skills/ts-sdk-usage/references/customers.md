# Customers

```ts
suqo.customers.list(params?: PageParams): Promise<Page<Customer>>          // GET /api/v1/customers/
suqo.customers.autoPaging(params?: PageParams): AsyncIterableIterator<Customer>
suqo.customers.retrieve(id: string): Promise<Customer>                     // GET /api/v1/customers/{id}/
suqo.customers.create(params: CreateCustomerParams): Promise<Customer>     // POST /api/v1/customers/
suqo.customers.update(id: string, params: UpdateCustomerParams): Promise<Customer> // PATCH /api/v1/customers/{id}/
```

A customer record is also created implicitly the first time someone
subscribes, via [`subscriptions.create()`](subscriptions.md)'s `customer`
field — `create()` is for recording one without opening a subscription.
There's no `delete`.

A customer recorded here can be passed to `checkoutSessions.create()` as
`customerId` (2.0.0+): the buyer then goes straight to payment without
entering their details again. See `checkout-sessions.md`.

## A real resource, not a stub

Every method above is implemented and tested. Older copies of the SDK repo's
`specs/SDK-SPEC.md` described this resource as a stub that throws; that was
corrected by 2.0.0. `docs/typescript-addendum.md`'s file-layout list still
labels `customers.ts` "stub methods" as of 2.2.1 — that line is stale, ignore
it.

## Creating one

```ts
const customer = await suqo.customers.create({
  email: "ram@example.com", // required
  phone: "9800000000",      // optional
  fullName: "Ram Bahadur",
  address: "Kathmandu",
});
```

- **Changed in 2.0.0 (breaking):** `email` identifies the buyer and is
  **required**; `phone` is optional. In 1.x it was the other way round —
  code written against 1.x that omits `email` no longer compiles.
- `phone`, if sent, can't be changed later. It must be a Nepali mobile number
  (10 digits starting with 96, 97 or 98); a `+977` country code, a leading
  `0`, spaces and dashes are accepted and stripped.
- If you already have a customer with that email or phone, `create()` updates
  that customer instead of making a second one (the API answers `200`
  rather than `201`; both resolve to the `Customer`), and returns it — that makes
  `create()` safe for you to retry yourself, though the SDK never retries a
  write automatically.
- The name and address are your account's own copy of the buyer's details
  and aren't shared with other sellers.
- **Write vs. read names:** you send `phone`/`email`, and they come back on
  the `Customer` as `buyerPhone`/`buyerEmail`.

## Updating one

```ts
const updated = await suqo.customers.update("cus_1ce18d624", { fullName: "Ram Bahadur" });
```

Send only the fields you're changing — anything left out stays as it is.
Pass `""` to clear a field. `phone` can't be changed, so it isn't an option
here. A validation problem (a bad phone or email) throws `ValidationError`
with `fieldErrors` — see `errors.md`. Like every write in this SDK, `update()`
never auto-retries — a `NetworkError` means it may or may not have landed;
reconcile with `retrieve()`/`list()`, don't resend blindly.

## `Customer`'s own shape

```ts
interface Customer {
  id: string;   // opaque prefixed id, e.g. "cus_1ce18d624" — NOT a UUID, and NOT a plain integer
  buyerPhone: string | null;
  buyerEmail: string | null;
  fullName: string | null;
  address: string | null;
  createdAt: string;
}
```

`retrieve(id)`/`update(id, ...)` take that same opaque string. Prior to
`@suqo/sdk@1.1.0`, `id` was incorrectly typed and documented as a plain
`number` — the API has always returned this prefixed string, like `pbp_...`
on billing periods, so the old `number` type made `retrieve()` uncallable
as declared ([#42]). If you're upgrading from `1.0.0`: replace any customer
id you typed as `number` (variables, `Map<number, …>` keys, `retrieve(123)`)
with `string`, and add `address` (or `null`) to any `Customer` object you
construct by hand (e.g. test fixtures) — it's now a required property.

Every field except `id`/`createdAt` can be `null` — a customer record
doesn't guarantee it has a phone, email, or address on file (records created
before 2.0.0's email requirement may lack an email). `retrieve("")` and
`update("", ...)` (and `"."`/`".."`, which URL parsing resolves the same
way) both throw `SuqoConfigError` rather than silently colliding with
`list()`'s own URL.

[#42]: https://github.com/suqo-ai/suqo-sdk-ts/issues/42

## `CreateCustomerParams` / `UpdateCustomerParams`

```ts
interface CreateCustomerParams {
  email: string;      // required since 2.0.0
  phone?: string;     // optional since 2.0.0
  fullName?: string;
  address?: string;
}
interface UpdateCustomerParams {
  fullName?: string;
  email?: string;
  address?: string;
}
```

## Not the same type as the `customer` on a `Subscription`

This `Customer` record (this resource's own shape, above) is a genuinely
different type from `SubscriptionCustomer` — the object embedded under
`subscription.customer` when you call `subscriptions.list`/`retrieve` (see
`subscriptions.md`, `models.md`). The SDK never conflates them, and neither
should generated code: don't assume a `Customer.id` shows up anywhere on a
`Subscription`, and don't assume `SubscriptionCustomer`'s fields (`phone`,
`fullName`, `email`, `address`, `billing`, `shipping`, ...) exist on
`Customer` — they share only field *names*, not meaning, and only for
`fullName` and, as of `@suqo/sdk@1.1.0`, `address` too (confirmed directly
against the published `.d.ts`: `SubscriptionCustomer` has its own top-level
`address?: string`, distinct from this resource's `Customer.address`, and
also distinct from the nested `billing.address`/`shipping.address` under
it). Reading one's `address` tells you nothing about the other's.
