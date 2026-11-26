# BYOP — bring your own payment (`@suqo/sdk` 2.2.0+)

`suqo.byop` — `listPaymentMethods`, `replaceCredentials`,
`updateProcessingFee`. Signatures in `api-surface.md`.

On a BYOP account, payments are collected on the seller's **own** gateway
accounts (eSewa, Khalti, NPS, connectIPS, Fonepay) instead of SUQO's.
**SUQO switches an account to BYOP; the API can't.** Until it does, the two
writes throw `PermissionDeniedError` ("Your own payment account isn't
enabled.") — say the account isn't on BYOP rather than retrying.
`listPaymentMethods()` doesn't need BYOP (it still gets the usual KYC/key
403s).

**Types**: `PaymentMethod`, `ByopCredentials`, `UpdateByopFeeParams` and
`ByopFee` are importable from `@suqo/sdk` **only from 2.2.1**. On 2.2.0 the
methods work but `import type { ByopCredentials } from "@suqo/sdk"` fails —
upgrade rather than working around it.

## Listing payment methods

```ts
const methods = await suqo.byop.listPaymentMethods();   // PaymentMethod[], not paginated, hidden ones included
const esewa = methods.find((m) => m.paymentType === "esewa");
```

`PaymentMethod`: `paymentTypeId` (a UUID — what the two writes take),
`paymentType` (`"esewa"`, `"esewa_intent"`, `"khalti"`, `"nps"`,
`"connectips"`, `"fonepay-checkout"`, or any newer string), `alias`
(`string | null`), `logo` (`string | null`), `order`, `isActive` (`false` when
hidden), `fee` (`string | null` — your own processing fee on BYOP, `"0.00"`
when unset; `null` for Khalti, NPS and cash, and possibly when not on BYOP),
`isConfigured` (credentials saved), `isVerified` (`true` accepted, `false`
refused, `null` not checked yet), `companyId`.

Showing, hiding and reordering methods stay in the dashboard — no SDK call.

## Replacing credentials

```ts
await suqo.byop.replaceCredentials(esewa.paymentTypeId, {
  paymentType: "esewa",        // lets TypeScript check the fields; never sent
  productCode: "EPAYTEST",
  merchantSecret: process.env.ESEWA_SECRET!,
});
```

- **Send the full set every time** — it replaces what's stored (a `PATCH`
  that behaves like a replace; hence the name).
- Keys are **camelCase**, sent snake_case (`merchantSecret` →
  `merchant_secret`). A snake_case key throws `SuqoConfigError` before any
  request.
- The API validates the set (missing, empty or unknown fields →
  `ValidationError`, whose `fieldErrors` use the snake_case wire names). A
  gateway the API adds later is sent as is; TypeScript needs a cast
  (`as unknown as ByopCredentials`) until the SDK's union is updated.
- Text/secret values ≤ 500 characters; files (`pfx`, `privateKey`) are base64
  strings under 2.5 MB; checkbox fields must be `true`.

| `paymentType` | Fields |
| --- | --- |
| `esewa`, `esewa_intent` | `productCode`, `merchantSecret` |
| `khalti` | `merchantSecret` |
| `nps` | `merchantId`, `merchantName`, `apiUsername`, `apiPassword`, `merchantSecret`, `isWebhooksUrlSet: true` |
| `connectips` | `merchantId`, `appId`, `appName`, `appPassword`, `pfx`, `pfxPassword`, `isResponseUrlConfirmation: true` |
| `fonepay-checkout` | `username`, `password`, `privateKey`, `terminalId` |

**Credentials are never returned** — it resolves `void`. The API checks them
in the background: call `listPaymentMethods()` later and read `isVerified`.
Replacing saved credentials emails the company address. A field
`ValidationError` never echoes the submitted value. One with only a message
(raw body `code: "byop_payment_pending"`) means a payment on this gateway is
still processing — nothing changed, so it's safe to retry once it finishes.

## Setting the processing fee

```ts
const fee = await suqo.byop.updateProcessingFee(esewa.paymentTypeId, { processingFee: "1.75" });
fee.processingFee;   // "1.75" — as stored, two decimals ("1.5" reads back "1.50")

await suqo.byop.updateProcessingFee(id, { processingFee: null });   // clears it (counts as 0)
```

A percent from 0 to 100, as a **string** — a number or a missing
`processingFee` throws `SuqoConfigError` before any request. Khalti and NPS
report their own fee per payment, so setting one for them throws
`ValidationError`, as does a value over 100.

Both writes are rate-limited (`RateLimitError`) and never retried.
