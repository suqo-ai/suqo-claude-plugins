import { RateLimitError, ValidationError, type CheckoutItemInput, type CheckoutSessionResponse } from "@suqo/sdk";
import { getSuqoClient } from "./suqo-client.js";

/**
 * The recommended way to collect payment (@suqo/sdk 2.0.0+): one checkout for
 * one to ten items. Each item is EITHER a catalogue item (`{ pbpId }`, priced
 * by the plan) OR a partner-priced item (`{ name, amount, intervalType,
 * intervalCount }`, priced by you) — never a mix; the types make a mix a
 * compile error.
 *
 * Open the session when the buyer commits to paying, not on page load:
 * checkoutSessions.create() is rate-limited (20 a minute per account) and,
 * like every write, never retried by the SDK.
 *
 * `checkoutUrl` is NOT proof of payment, and neither is the buyer landing on
 * `returnUrl`. The outcome arrives as checkout.succeeded / checkout.failed,
 * whose `session_id` equals the `publicId` returned here — store it now.
 */
export async function openCheckout(params: {
  returnUrl: string;
  /** A cus_… from customers.create(). Omit it to have the buyer enter their details at checkout. */
  customerId?: string;
}): Promise<CheckoutSessionResponse> {
  const items: CheckoutItemInput[] = [
    // A catalogue item: the billing period's pbpId from products.list().
    { pbpId: "pbp_example" },
    // A partner-priced item: amount is a decimal string that already includes any discount.
    { name: "Setup fee", amount: "500.00", intervalType: "one_time", intervalCount: 0 },
  ];

  return getSuqoClient().checkoutSessions.create({
    items,
    returnUrl: params.returnUrl,
    ...(params.customerId ? { customerId: params.customerId } : {}),
  });
}

/** Maps the errors this call can raise to an HTTP-ish result for a route handler. */
export async function handleOpenCheckout(req: {
  returnUrl: string;
  customerId?: string;
}): Promise<{ status: number; body: unknown }> {
  try {
    const session = await openCheckout(req);
    // Persist session.publicId against your order before redirecting.
    return { status: 201, body: { checkoutUrl: session.checkoutUrl, sessionId: session.publicId } };
  } catch (err) {
    if (err instanceof RateLimitError) {
      // retryAfter is milliseconds, when the API named a wait.
      return { status: 429, body: { message: err.message, retryAfter: err.retryAfter } };
    }
    if (err instanceof ValidationError) {
      return { status: 422, body: { message: err.message, fieldErrors: err.fieldErrors } };
    }
    throw err;
  }
}
