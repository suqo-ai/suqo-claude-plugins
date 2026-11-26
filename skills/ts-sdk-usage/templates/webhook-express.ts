import express from "express";
import type { WebhookEvent } from "@suqo/sdk";
import { getSuqoClient } from "./suqo-client.js";

export const router = express.Router();

// express.raw() is scoped to just THIS route — every other route on this app
// keeps its normal express.json() parsing untouched. Mounting it globally is
// the single most common way to break this handler. It also caps the body at
// 100kb by default (pass { limit: "..." } to change it) — unlike the plain
// Node / Next.js templates, which have to enforce that themselves.
router.post("/webhooks/suqo", express.raw({ type: "application/json" }), (req, res) => {
  const rawBody = req.body as Buffer; // the raw bytes, thanks to express.raw() above
  const signature = req.header("x-suqo-signature");
  const timestamp = req.header("x-suqo-timestamp");

  if (!signature || !timestamp) {
    res.sendStatus(400);
    return;
  }

  const secret = process.env.SUQO_WEBHOOK_SECRET;
  if (!secret) {
    // verify() itself handles this fine (returns false, doesn't throw) —
    // checked explicitly anyway so a misconfigured deployment gets a
    // distinct, loud signal instead of blending into bad-signature noise.
    console.error("SUQO_WEBHOOK_SECRET is not set");
    res.sendStatus(500);
    return;
  }

  const verified = getSuqoClient().webhooks.verify({ rawBody, signature, timestamp, secret });

  if (!verified) {
    res.sendStatus(400);
    return;
  }

  // Return 2xx fast, then process out of band.
  res.sendStatus(200);

  // Parse only AFTER verifying. Event payloads stay snake_case on purpose. The
  // 200 already went out, so a parse failure here can only be logged — a
  // verified signature says the bytes came from SUQO, not that they're valid
  // JSON. Express does swallow a synchronous throw here without crashing the
  // process, but silently — logging explicitly instead of relying on that.
  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8")) as WebhookEvent;
  } catch (err) {
    console.error("verified event had an unparseable body:", err);
    return;
  }

  // .catch(), not bare fire-and-forget — an uncaught rejection here would
  // crash the whole process (Node terminates on unhandled rejection by
  // default) over a single bad event, taking down every other in-flight request.
  processEvent(event).catch((err: unknown) => console.error("processEvent failed:", err));
});

async function processEvent(event: WebhookEvent): Promise<void> {
  // Be idempotent — redelivery is normal and the SDK keeps no replay store of its own.
  // Key checkout.* on session_id (one delivery per checkout session, the cks_… returned as
  // publicId when the session was opened), subscription.status_changed on subscription_id +
  // changed_at, api_key.* on api_key_id + event. No event has a field literally named `id`.
  switch (event.event) {
    case "checkout.succeeded":
      // Grant access per line item: each carries the subscription it pays for. There is no
      // top-level subscription_id on a checkout event (changed in @suqo/sdk 2.0.0).
      for (const item of event.line_items) {
        console.log("paid", event.session_id, item.subscription_id ?? "(no subscription_id)", item.name, item.amount);
      }
      break;
    case "checkout.failed":
      // Final, after SUQO's own retries. Its line items' subscription_id is a placeholder that
      // never activates — don't grant anything on it.
      console.log("checkout failed", event.session_id, event.amount);
      break;
    case "subscription.status_changed":
      console.log(event.subscription_id, event.previous_status, "->", event.current_status);
      break;
    default:
      console.log("unhandled event", event.event);
  }
}
