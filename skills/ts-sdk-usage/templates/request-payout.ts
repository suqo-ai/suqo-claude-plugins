import { ValidationError, type BankAccount, type Payout } from "@suqo/sdk";
import { getSuqoClient } from "./suqo-client.js";

/**
 * Payouts need a VERIFIED bank account (one per seller). The flow, @suqo/sdk 2.2.0+:
 *
 *   1. bankAccounts.create()          — saved unverified (verifiedAt: null)
 *   2. bankAccounts.sendOtp(id)       — SUQO emails a 6-digit code to the seller's
 *                                       company (or login) email, NOT to the caller
 *   3. bankAccounts.update(id, {code})— the seller types the code into your app
 *   4. payouts.create()               — pays out everything currently due
 *
 * Nothing here is retried by the SDK. sendOtp() and update() are rate-limited
 * (RateLimitError) — calling sendOtp() again is how "resend code" works, and
 * replaces the previous code.
 */
export async function addBankAccount(): Promise<BankAccount> {
  const suqo = getSuqoClient();
  const account = await suqo.bankAccounts.create({
    bankName: "Nabil Bank",
    accountName: "Himalayan Tea Pvt. Ltd.",
    accountNumber: "0123456789", // 7–21 characters
    branch: "Kathmandu",
  });
  await suqo.bankAccounts.sendOtp(account.id); // id is a number, unlike most SUQO ids
  return account;
}

/**
 * `code` is a string, exactly as the seller typed it — never a number, which
 * would drop a leading zero. A wrong or expired code is a ValidationError with
 * the message in fieldErrors.code (a field error, no `detail`); a refusal such
 * as a pending payout carries a reason in rawBody.code instead.
 */
export async function verifyBankAccount(id: number, code: string): Promise<BankAccount> {
  return getSuqoClient().bankAccounts.update(id, { code });
}

/** A refusal's reason code, from the { detail, code } 400 body payouts and bank accounts send. */
function refusalCode(err: ValidationError): string | undefined {
  const body = err.rawBody as { detail?: unknown; code?: unknown } | undefined;
  // Only a body with `detail` is a coded refusal; { code: "<message>" } alone is a wrong OTP.
  return typeof body?.detail === "string" && typeof body.code === "string" ? body.code : undefined;
}

export async function requestPayout(): Promise<Payout | { refused: string }> {
  try {
    const payout = await getSuqoClient().payouts.create(); // no arguments
    return payout; // status "PENDING"; track it with payouts.retrieve(payout.payoutId)
  } catch (err) {
    if (err instanceof ValidationError) {
      // pending_payout_request_exists, payout_below_minimum, no_transactions_due,
      // bank_account_not_found, bank_account_not_verified
      return { refused: refusalCode(err) ?? err.message };
    }
    throw err;
  }
}
