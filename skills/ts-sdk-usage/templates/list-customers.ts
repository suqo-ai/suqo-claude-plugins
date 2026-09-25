import { getSuqoClient } from "./suqo-client.js";

/**
 * Lists customers, then retrieves one by id. A customer record is also
 * created implicitly the first time a buyer completes checkout; see
 * references/customers.md for the separate create()/update() calls.
 *
 * Unlike every other resource in the SDK, Customer.id is an opaque
 * prefixed string (e.g. "cus_1ce18d624"), not a UUID — see
 * references/customers.md.
 */
async function main(): Promise<void> {
  const suqo = getSuqoClient();

  const page = await suqo.customers.list({ pageSize: 100 });
  console.log(`${page.results.length} customer(s) on this page (of ${page.count} total)\n`);

  for (const customer of page.results) {
    console.log(`#${customer.id}  ${customer.fullName ?? "(no name on file)"}  ${customer.buyerEmail ?? ""}`);
  }

  const first = page.results[0];
  if (first) {
    // retrieve() takes the same opaque string id — fetch this one again to show the single-record shape.
    const fetched = await suqo.customers.retrieve(first.id);
    console.log(`\nRetrieved #${fetched.id} directly:`, fetched);
  } else {
    console.log("\nNo customers yet — one is created the first time a buyer completes checkout.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
