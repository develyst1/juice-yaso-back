import { createMiddleware } from "hono/factory";
import { HttpError } from "../lib/errors";

export const requireAdmin = createMiddleware(async (c, next) => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    throw new HttpError(500, "ADMIN_TOKEN is not configured", "SERVER_MISCONFIG");
  }
  const token = c.req.header("X-Admin-Token");
  if (!token || token !== expected) {
    throw new HttpError(401, "Unauthorized", "UNAUTHORIZED");
  }
  await next();
});
