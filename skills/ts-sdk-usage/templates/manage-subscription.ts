import type { CheckoutSessionResponse, MessageResponse } from "@suqo/sdk";
import { getSuqoClient } from "./suqo-client.js";
import { handleSubscriptionWrite } from "./subscription-error-handling.js";

/** Schedules cancellation at the end of the current billing period — not immediate. */
export async function cancelSubscription(subscriptionId: string): Promise<MessageResponse> {
  return getSuqoClient().subscriptions.cancel(subscriptionId);
}

/**
 * Collection-level call — subscriptionId travels in the request body, not the
 * URL path, unlike cancel()/resume(). nextBillingCycle must be today-or-future,
 * formatted "YYYY-MM-DD".
 */
export async function updateSubscriptionBillingCycle(
  subscriptionId: string,
  nextBillingCycle: string,
): Promise<MessageResponse> {
  return getSuqoClient().subscriptions.updateBillingCycle({ subscriptionId, nextBillingCycle });
}

/**
 * Undoes a scheduled cancellation (pending_cancellation -> active). An
 * already-active subscription comes back unchanged. A `cancelled` one has
 * nothing to resume — restart it with renewSubscription() below instead.
 */
export async function resumeSubscription(subscriptionId: string): Promise<MessageResponse> {
  return getSuqoClient().subscriptions.resume(subscriptionId);
}

/**
 * Opens a checkout session for the subscription's next payment, reusing its
 * customer and billing period — how an inactive subscription is restarted.
 * Send the buyer to `checkoutUrl`; the outcome arrives as a checkout.* webhook
 * whose session_id equals the returned `publicId`. A cancelled or archived
 * subscription, or a paid one-time purchase, throws ValidationError.
 */
export async function renewSubscription(subscriptionId: string): Promise<CheckoutSessionResponse> {
  return getSuqoClient().subscriptions.renew(subscriptionId);
}

/**
 * The four functions above are raw — they let a SuqoError subclass
 * propagate uncaught, same as `createSubscriptionForBuyer` does in
 * templates/create-subscription.ts. Wrap them in `handleSubscriptionWrite`
 * (from templates/subscription-error-handling.ts) before exposing them on a
 * route, exactly like that file's own `handleCreateSubscription` does —
 * these wrappers are the equivalent for cancel/updateBillingCycle/resume/
 * renew. Skipping the wrapper means KycRequiredError/AuthenticationError
 * (merchant-config problems) can reach a buyer-facing response unmapped.
 */
export async function handleCancelSubscription(subscriptionId: string): Promise<{ status: number; body: unknown }> {
  return handleSubscriptionWrite(() => cancelSubscription(subscriptionId));
}

export async function handleUpdateSubscriptionBillingCycle(
  subscriptionId: string,
  nextBillingCycle: string,
): Promise<{ status: number; body: unknown }> {
  return handleSubscriptionWrite(() => updateSubscriptionBillingCycle(subscriptionId, nextBillingCycle));
}

export async function handleResumeSubscription(subscriptionId: string): Promise<{ status: number; body: unknown }> {
  return handleSubscriptionWrite(() => resumeSubscription(subscriptionId));
}

export async function handleRenewSubscription(subscriptionId: string): Promise<{ status: number; body: unknown }> {
  return handleSubscriptionWrite(() => renewSubscription(subscriptionId), 201);
}
