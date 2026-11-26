# Payouts (`@suqo/sdk` 2.2.0+)

`suqo.payouts` — `list`, `autoPaging`, `create`, `retrieve`. Signatures in
`api-surface.md`.

A payout sends everything currently due to your **verified bank account**
(see `bank-accounts.md`), less gateway fees, the platform fee and unbilled SMS
usage.

## The record

`Payout`:

| Field | Type | Notes |
| --- | --- | --- |
| `payoutId` | `string` | `PYT-…`, e.g. `"PYT-MF4G9W-CTEP55"` — what `retrieve()` takes |
| `status` | `"PENDING" \| "COMPLETED" \| string` | Upper case, unlike other SUQO statuses. Handle unknown values |
| `amount` | `string` | Gross total of the transactions |
| `providerCharge` | `string` | Gateway fees |
| `suqoPlatformFee` | `string` | SUQO's fee |
| `smsCharge` | `string` | SMS usage billed into this payout |
| `netAmount` | `string` | What reaches the bank account |
| `requestedDate` | `string` | ISO 8601 |
| `paidDate` | `string \| null` | `null` until paid |
| `receiptUrl` | `string \| null` | Can stay `null` even on a `COMPLETED` payout |

Every amount is a **decimal string with two decimals** (`"11835.00"`) —
never coerce to `number`. Dates carry an offset (`Z` or `+05:45`), with or
without microseconds: parse them, don't compare them as strings.

## Requesting a payout

```ts
import { ValidationError } from "@suqo/sdk";

try {
  const payout = await suqo.payouts.create();   // no arguments
  payout.status;                                // "PENDING"
} catch (err) {
  if (err instanceof ValidationError) {
    const code = (err.rawBody as { code?: string } | undefined)?.code;
    // pending_payout_request_exists | payout_below_minimum | no_transactions_due
    // | bank_account_not_found | bank_account_not_verified
  }
  throw err;
}
```

A refusal is a `400` `{ "detail": "…", "code": "…" }`: `err.message` is the
`detail`, `err.fieldErrors` is empty, and the reason is **only** in
`err.rawBody.code` — there's no typed `err.code` (deferred in the SDK).
Branch on the code, not the message wording.

| `code` | Meaning |
| --- | --- |
| `pending_payout_request_exists` | One is already pending — only one at a time |
| `payout_below_minimum` | Net amount under the minimum payout |
| `no_transactions_due` | Nothing to pay out |
| `bank_account_not_found` | Add one — `bankAccounts.create()` |
| `bank_account_not_verified` | `bankAccounts.sendOtp()` then `update(id, { code })` |

`create()` is a write and never retried. Because only one payout can be
pending, a repeat after a success can't pay twice — it gets
`pending_payout_request_exists`. So after a `NetworkError`, check `list()`
before assuming it failed.

Before KYC clears, `payouts.*` throws `KycRequiredError` (never on the
sandbox).

## Listing and tracking

```ts
const page = await suqo.payouts.list();      // newest first, 20 per page, up to 100 with pageSize
for await (const p of suqo.payouts.autoPaging({ pageSize: 100 })) { /* every payout */ }

const one = await suqo.payouts.retrieve("PYT-MF4G9W-CTEP55");   // NotFoundError if unknown
```

Start from `templates/request-payout.ts`.
