/**
 * Happy-path smoke against a running local server + DB.
 * Usage: bun run smoke  (expects server on PORT, default 3000)
 */
const BASE = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const ADMIN = process.env.ADMIN_TOKEN ?? "dev-admin-token";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function json(res: Response) {
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`${res.status} ${JSON.stringify(body)}`);
  }
  return body as Record<string, unknown>;
}

async function main() {
  console.log("smoke →", BASE);

  const health = await fetch(`${BASE}/health`);
  assert(health.ok, "health failed");

  const catalog = await json(await fetch(`${BASE}/api/v1/catalog`));
  assert(Array.isArray(catalog.flavors) && (catalog.flavors as unknown[]).length === 5, "5 flavors");
  assert((catalog.pricing as { basePricePerCup: number }).basePricePerCup === 5, "base price 5");

  // ≤100 cups → unit 5
  const orderA = await json(
    await fetch(`${BASE}/api/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "Smoke Test",
        customerPhone: "0812345678",
        lines: [
          { crateSize: 50, quantity: 1, flavor: "orange" },
          { crateSize: 30, quantity: 1, flavor: "องุ่น" },
        ],
      }),
    }),
  );
  assert(orderA.status === "awaiting_payment", "status awaiting_payment");
  assert(orderA.cupsTotal === 80, `cupsTotal 80 got ${orderA.cupsTotal}`);
  assert(orderA.productTotal === 400, `productTotal 400 got ${orderA.productTotal}`);
  assert(orderA.depositTotal === 140, `deposit 140 got ${orderA.depositTotal}`);
  const queueCode = orderA.queueCode as string;

  // >100 cups → 4.5
  const orderB = await json(
    await fetch(`${BASE}/api/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "Bulk",
        customerPhone: "0899999999",
        lines: [{ crateSize: 100, quantity: 2, flavor: "cocoa" }],
      }),
    }),
  );
  assert(orderB.cupsTotal === 200, "200 cups");
  assert(orderB.productTotal === 900, `bulk product 900 got ${orderB.productTotal}`);

  // Upload slip
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const form = new FormData();
  form.append("file", new File([png], "slip.png", { type: "image/png" }));
  const slipRes = await json(
    await fetch(`${BASE}/api/v1/queue/${queueCode}/slips`, {
      method: "POST",
      body: form,
    }),
  );
  assert(slipRes.status === "awaiting_slip_review", "awaiting_slip_review");
  const slipId = slipRes.slipId as string;

  // Reject then re-upload then approve
  await json(
    await fetch(`${BASE}/api/v1/admin/slips/${slipId}/reject`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Admin-Token": ADMIN,
      },
      body: JSON.stringify({ reason: "blurry" }),
    }),
  );

  const form2 = new FormData();
  form2.append("file", new File([png], "slip2.png", { type: "image/png" }));
  const slip2 = await json(
    await fetch(`${BASE}/api/v1/queue/${queueCode}/slips`, {
      method: "POST",
      body: form2,
    }),
  );

  await json(
    await fetch(`${BASE}/api/v1/admin/slips/${slip2.slipId}/approve`, {
      method: "POST",
      headers: { "X-Admin-Token": ADMIN },
    }),
  );

  const q = await json(await fetch(`${BASE}/api/v1/queue/${queueCode}`));
  assert(q.status === "in_queue", "in_queue after approve");
  const orderId = q.orderId as string;

  for (const status of ["packing", "ready_for_pickup", "picked_up"] as const) {
    await json(
      await fetch(`${BASE}/api/v1/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "X-Admin-Token": ADMIN,
        },
        body: JSON.stringify({ status }),
      }),
    );
  }

  // Invalid transition should fail
  const bad = await fetch(`${BASE}/api/v1/admin/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "X-Admin-Token": ADMIN,
    },
    body: JSON.stringify({ status: "packing" }),
  });
  assert(bad.status === 409, "invalid transition → 409");

  // Deposit return
  await json(
    await fetch(`${BASE}/api/v1/admin/orders/${orderId}/deposit-returns`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Admin-Token": ADMIN,
      },
      body: JSON.stringify({ cratesReturned: true }),
    }),
  );

  // Cancel path on fresh order
  const cancelOrder = await json(
    await fetch(`${BASE}/api/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "Cancel Me",
        customerPhone: "0800000000",
        lines: [{ crateSize: 30, quantity: 1, flavor: "lychee" }],
      }),
    }),
  );
  await json(
    await fetch(`${BASE}/api/v1/queue/${cancelOrder.queueCode}/cancel`, {
      method: "POST",
    }),
  );

  // Admin without token
  const unauth = await fetch(`${BASE}/api/v1/admin/orders`);
  assert(unauth.status === 401, "admin requires token");

  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAIL", e);
  process.exit(1);
});
