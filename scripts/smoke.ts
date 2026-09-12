/**
 * Happy-path smoke against a running local server + DB.
 * Usage: bun run smoke  (expects server on PORT, default 3000)
 * API v1.1 — crates[{crateSize, fills[{flavor,cups}]}]
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

  // Reject legacy lines payload
  const legacy = await fetch(`${BASE}/api/v1/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerName: "Legacy",
      customerPhone: "0812345678",
      lines: [{ crateSize: 30, quantity: 1, flavor: "orange" }],
    }),
  });
  assert(legacy.status === 400, "legacy lines → 400");
  const legacyBody = (await legacy.json()) as { error?: string };
  assert(
    typeof legacyBody.error === "string" && legacyBody.error.includes("lines"),
    "legacy error mentions lines",
  );

  // ≤100 cups → unit 5; mixed flavors in one crate
  const orderA = await json(
    await fetch(`${BASE}/api/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "Smoke Test",
        customerPhone: "0812345678",
        crates: [
          {
            crateSize: 50,
            fills: [
              { flavor: "orange", cups: 30 },
              { flavor: "lychee", cups: 20 },
            ],
          },
          {
            crateSize: 30,
            fills: [{ flavor: "องุ่น", cups: 30 }],
          },
        ],
      }),
    }),
  );
  assert(orderA.status === "awaiting_payment", "status awaiting_payment");
  assert(orderA.cupsTotal === 80, `cupsTotal 80 got ${orderA.cupsTotal}`);
  assert(orderA.productTotal === 400, `productTotal 400 got ${orderA.productTotal}`);
  assert(orderA.depositTotal === 140, `deposit 140 got ${orderA.depositTotal}`);
  const queueCode = orderA.queueCode as string;

  const q0 = await json(await fetch(`${BASE}/api/v1/queue/${queueCode}`));
  assert(Array.isArray(q0.crates) && (q0.crates as unknown[]).length === 2, "queue returns crates");
  const crate0 = (q0.crates as { crateSize: number; deposit: number; fills: unknown[] }[])[0];
  assert(crate0.crateSize === 50 && crate0.deposit === 90, "first crate size/deposit");
  assert(crate0.fills.length === 2, "mixed fills");

  // >100 cups → 4.5
  const orderB = await json(
    await fetch(`${BASE}/api/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "Bulk",
        customerPhone: "0899999999",
        crates: [
          { crateSize: 100, fills: [{ flavor: "cocoa", cups: 100 }] },
          { crateSize: 100, fills: [{ flavor: "cocoa", cups: 100 }] },
        ],
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
        crates: [{ crateSize: 30, fills: [{ flavor: "lychee", cups: 30 }] }],
      }),
    }),
  );
  await json(
    await fetch(`${BASE}/api/v1/queue/${cancelOrder.queueCode}/cancel`, {
      method: "POST",
    }),
  );

  // Admin list includes crates + pendingSlipId
  const adminList = await json(
    await fetch(`${BASE}/api/v1/admin/orders`, {
      headers: { "X-Admin-Token": ADMIN },
    }),
  );
  assert(Array.isArray(adminList.orders), "admin orders list");
  const listed = (adminList.orders as { crates?: unknown; pendingSlipId?: unknown }[])[0];
  assert(listed && Array.isArray(listed.crates), "admin list has crates");
  assert("pendingSlipId" in listed, "admin list has pendingSlipId");

  // Admin without token
  const unauth = await fetch(`${BASE}/api/v1/admin/orders`);
  assert(unauth.status === 401, "admin requires token");

  // Phone validation
  const badPhone = await fetch(`${BASE}/api/v1/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerName: "Bad Phone",
      customerPhone: "081-234-5678",
      crates: [{ crateSize: 30, fills: [{ flavor: "orange", cups: 30 }] }],
    }),
  });
  assert(badPhone.status === 400, "non-digit phone → 400");

  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAIL", e);
  process.exit(1);
});
