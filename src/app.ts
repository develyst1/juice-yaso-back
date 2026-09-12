import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { HttpError } from "./lib/errors";
import { catalogRoutes } from "./routes/catalog";
import { orderRoutes } from "./routes/orders";
import { queueRoutes } from "./routes/queue";
import { adminRoutes } from "./routes/admin";

export const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, service: "juice-yaso-back" }));

app.use("/uploads/*", serveStatic({ root: "./" }));

const v1 = new Hono();
v1.route("/", catalogRoutes);
v1.route("/", orderRoutes);
v1.route("/", queueRoutes);
v1.route("/admin", adminRoutes);

app.route("/api/v1", v1);

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(
      { error: err.message, code: err.code ?? "ERROR" },
      err.status as 400,
    );
  }
  console.error(err);
  return c.json({ error: "Internal Server Error", code: "INTERNAL" }, 500);
});

app.notFound((c) => c.json({ error: "Not Found", code: "NOT_FOUND" }, 404));
