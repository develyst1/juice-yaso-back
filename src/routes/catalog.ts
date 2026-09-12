import { Hono } from "hono";
import { getCatalog } from "../services/catalog";

export const catalogRoutes = new Hono();

catalogRoutes.get("/catalog", async (c) => {
  const catalog = await getCatalog();
  return c.json(catalog);
});
