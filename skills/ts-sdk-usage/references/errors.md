# Errors

```
Error
└── SuqoError                 status?, rawBody?, requestId?   — never thrown directly itself
    ├── SuqoConfigError       bad key/baseUrl at construction, or a bad argument caught before
    │                         any request (empty id, snake_case BYOP key, …); never carries
    │                         status/rawBody (there was no request)
    ├── AuthenticationError   401
    ├── KycRequiredError      403 with a KYC body (status_code) — adds kycStatus?: string
    ├── PermissionDeniedError 403, any other body — 2.0.0+
    ├── ValidationError       400 — adds fieldErrors: FieldErrors (Record<string, string[]>)
    ├── NotFoundError         404
    ├── RateLimitError        429 — adds retryAfter?: number (ms)
    ├── ServerError           5xx, and the default for any unmapped status
    └── NetworkError          no HTTP status at all — network failure, timeout, or cancellation
```

**`SuqoConfigError` extends `SuqoError`** — `catch (err) { if (err instanceof
SuqoError) ... }` catches it too. Every error this SDK throws is a
`SuqoError`; the base class itself is just never thrown directly.

`rawBody` is the parsed JSON body — **or, since 2.1.0, the raw text when the
response wasn't JSON** (e.g. a firewall's HTML page). Check
`typeof err.rawBody === "string"` before reading it as an object.

`requestId` is declared on the base class and threaded through
`mapHttpError`'s input type, but the SDK flags it as a pending nice-to-have:
it's normally `undefined`. Don't build error-correlation logic keyed on it.

`NetworkError` carries no `status` — it's thrown directly by the HTTP layer
itself (a `fetch` rejection or an `AbortSignal.timeout` firing), never via
`mapHttpError`, since there was never a response to map. It covers both a
genuine network failure and a timeout — there's no separate timeout class.

Check `instanceof`, never the error's `message` string — wording carries no
stability guarantee.

## `SuqoConfigError` — thrown before any request

Thrown synchronously from `new SuqoClient(...)` for a bad API key format, or a
`baseUrl` that disagrees with the key's inferred environment (see
`client-setup.md`). Also thrown by a method call for an argument that would
otherwise corrupt the request: an empty, `"."` or `".."` id (every id-taking
method, 2.0.0+), `"secret"` as a webhook id, a non-positive-integer
bank-account id, a snake_case key in `byop.replaceCredentials()`, or a
non-string `processingFee`. It means "fix the code," not "handle this request
differently."

## `ValidationError` normalizes three wire shapes into one

```ts
type FieldErrors = Record<string, string[]>;

class ValidationError extends SuqoError {
  readonly fieldErrors: FieldErrors;   // always a plain object, never undefined
}
```

The wire sends one of these 400 shapes:

- **Field-keyed**: `{ "phone": ["This field is required."] }` → populates
  `fieldErrors`. Nested objects are flattened to dot-path keys
  (`customer.phone`) — and that root key is already renamed from the wire's
  `client` to `customer`, same rename as everywhere else in this SDK.
- **`detail`-shaped**: `{ "detail": "..." }` → populates only `message`;
  `fieldErrors` stays `{}`. Payout and bank-account refusals add a reason
  code beside it, `{ "detail": "…", "code": "payout_below_minimum" }`: the
  code is **only** in `err.rawBody.code` (there's no typed `err.code`), and it
  is never mistaken for a field.
- **Bare list**: `["This is a one-time purchase, so there is nothing to
  cancel."]` → the messages become `message` (2.0.0+; earlier versions said
  `"Validation failed."`), `fieldErrors` `{}`. Sent by `cancel`, `resume` and
  `renew`, and by the one-subscription-per-product refusal.

One trap: a **wrong bank-account OTP** is field-keyed on a field named
`code` — `{ "code": "Invalid verification code." }` → `fieldErrors.code`. Tell
it apart from a coded refusal by `detail`: only a refusal has one. See
`bank-accounts.md`.

## `KycRequiredError` vs `PermissionDeniedError` — both are 403

Since 2.0.0 a 403 is **`KycRequiredError` only when the body carries
`status_code`** (`{ "status_code": "KYC_INCOMPLETE" | "KYC_VERIFICATION_PENDING",
"message": "…" }`); `kycStatus` is read from it. Any other 403 is
**`PermissionDeniedError`** — `{ "detail": "…" }`, e.g. a key that doesn't
belong to the account, or `"Your own payment account isn't enabled."` from a
BYOP write on a non-BYOP account. KYC is never enforced on the sandbox, so
only `PermissionDeniedError` occurs there.

A 403 that isn't JSON at all — usually a firewall in front of the API (e.g.
Cloudflare's `error code: 1010`, which blocks some HTTP clients by
`User-Agent`) — is also `PermissionDeniedError`, with the neutral message
`Request failed with status 403`; the page's text is in `rawBody`.

## Merchant-config problems, not buyer input problems

`AuthenticationError`, `KycRequiredError` and `PermissionDeniedError` all mean
something is wrong with *your own* SUQO setup — the merchant's key is
invalid/revoked, its KYC isn't complete, or the key/account can't use this
endpoint — never something the end buyer did. In a route that returns a
response to a buyer's browser, don't map these straight to a 401/403 sent to
the buyer, and don't leak `kycStatus`: it describes your account's standing,
not theirs. Log it loudly for your own alerting and return a generic 5xx.
`ValidationError`/`NotFoundError` are the ones that are genuinely about the
specific request and are safe to reflect back.

## `RateLimitError` — live on five calls

`checkoutSessions.create()` (20 sessions a minute per account),
`bankAccounts.update()`, `bankAccounts.sendOtp()`,
`byop.replaceCredentials()` and `byop.updateProcessingFee()` (limits not
published). Every other call is unlimited. `retryAfter` is milliseconds: from
a `Retry-After` header when present (delta-seconds or HTTP-date), otherwise
parsed from the wait the API writes into `detail` ("…Expected available in 41
seconds." — 2.0.0+), capped at 60 s. All five are writes, so the SDK never
retries them — wait `retryAfter` and retry yourself.

## Retries — the headline rule

**Reads** (`list`, `autoPaging`, `retrieve`, `retrieveSecret`,
`listPaymentMethods`) retry on `NetworkError`, `429`, and `5xx`, with
full-jitter exponential backoff (base 500ms, capped at 8s), up to
`maxRetries` (default 2 → 3 attempts total), honoring `Retry-After` when
present.

**Writes** (every `create`, `update`, `replace`, `delete`, `cancel`,
`updateBillingCycle`, `resume`, `renew`, `testDelivery`, `sendOtp`,
`replaceCredentials`, `updateProcessingFee`) **never retry**, regardless of
`maxRetries`. There's no idempotency-key support yet — a blindly-retried
write could double-act, e.g. open a second checkout session. A `NetworkError`
from a write means it may or may not have landed; reconcile by re-reading,
don't just resend. (`customers.create()` is an upsert and `payouts.create()`
refuses a second pending payout, so those two are safe to retry by hand.)

Internally, a caller-supplied `AbortSignal` is never retried either — but no
public resource method accepts a `signal`. See `pagination.md`: there's
currently no supported way to cancel an in-flight call from application code.

## `mapHttpError`

```ts
function mapHttpError(input: { status: number; statusText?: string; body?: unknown; requestId?: string; retryAfter?: number }): SuqoError
```

The single centralized status→class mapper every resource routes through.
Exported for anyone building a custom transport around the same rules — see
`api-surface.md`.
