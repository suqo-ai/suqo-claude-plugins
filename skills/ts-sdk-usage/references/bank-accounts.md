# Bank accounts (`@suqo/sdk` 2.2.0+)

`suqo.bankAccounts` — `list`, `create`, `retrieve`, `update`, `delete`,
`sendOtp`. Signatures in `api-surface.md`. The account payouts go to — **one
per seller**. A payout needs it **verified** (see `payouts.md`).

## The record

`BankAccount`: `id` (**`number`** — the one integer id in the SDK; anything
but a positive integer throws `SuqoConfigError` before a request), `bankName`,
`accountName`, `branch`, `accountNumberMasked`, `verifiedAt` (`string | null`
— `null` until first verified), `createdAt`, `updatedAt`.

`accountNumberMasked` holds the **full** account number while the account is
unverified, and `****4521` once verified. Don't log or display it before
verification.

## Adding and verifying — the OTP flow

Adding an account doesn't take a code; it's saved **unverified**. Your code
then has to ask SUQO to send one:

```ts
// 1. Save it — unverified, verifiedAt: null
const account = await suqo.bankAccounts.create({
  bankName: "Nabil Bank",
  accountName: "Himalayan Tea Pvt. Ltd.",
  accountNumber: "0123456789",   // 7–21 characters
  branch: "Kathmandu",
});

// 2. SUQO emails a 6-digit code (valid 10 minutes) to the seller's verified
//    company email, or their login email — NOT to the caller.
await suqo.bankAccounts.sendOtp(account.id);

// 3. The seller types the code into your app; send it as a STRING.
const verified = await suqo.bankAccounts.update(account.id, { code: codeTheSellerTyped });
verified.verifiedAt;            // set
verified.accountNumberMasked;   // "****6789"
```

- **`code` is a `string`**, exactly as typed — never a number, which would
  drop a leading zero (`"012345"`). The API accepts it as a string although
  Swagger says integer.
- Each code works once. Calling `sendOtp()` again replaces the previous code —
  that's how a "resend code" button works.
- A person has to read the email; your code can't fetch the OTP.

## Editing

Every edit goes through `update()` and **needs a fresh code**, even on an
already-verified account. Only the fields you pass change; the account stays
verified and `verifiedAt` moves to the time of the edit:

```ts
await suqo.bankAccounts.sendOtp(id);
await suqo.bankAccounts.update(id, { code, branch: "Lalitpur" });
```

## Errors

| Call | Error | How to read it |
| --- | --- | --- |
| `create()` | `ValidationError` | Field errors, or `rawBody.code` `bank_account_limit_reached` (already has one) |
| `sendOtp()` | `ValidationError` | `rawBody.code` `no_verified_email` |
| `update()` | `ValidationError` | **Wrong/expired/missing code: `fieldErrors.code`** (body `{ "code": "<message>" }`, no `detail`). Or `rawBody.code` `bank_account_has_active_payout` |
| `delete()` | `ValidationError` | `rawBody.code` `bank_account_has_active_payout` |
| `update()`, `sendOtp()` | `RateLimitError` | Rate-limited; `retryAfter` in ms |
| any with an id | `NotFoundError` | Unknown id |

**A wrong OTP and a refusal both involve a key named `code` — tell them apart
by `detail`.** A refusal's body is `{ detail, code }` (`err.message` is the
detail, the reason is `err.rawBody.code`, `fieldErrors` is empty). A wrong
code's body is `{ code: "Invalid verification code." }` — a *field* error, so
it lands in `err.fieldErrors.code` and `rawBody.code` is a message, not a
reason code.

```ts
const body = err.rawBody as { detail?: unknown; code?: unknown } | undefined;
const refusal = typeof body?.detail === "string" ? body.code : undefined;   // reason code
const otpProblem = err.fieldErrors.code?.[0];                                // wrong/expired code
```

`list()` returns a plain array (not paginated), `[]` when there are none.
None of the writes is retried. Bank-account calls have no KYC gate.

Start from `templates/request-payout.ts`.
