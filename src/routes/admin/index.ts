import { Hono } from "hono";
import { requireAdmin } from "../../middleware/admin";
import { adminConfigRoutes } from "./config";
import { adminOrderRoutes } from "./orders";
import { adminSlipRoutes } from "./slips";

export const adminRoutes = new Hono();

adminRoutes.use("*", requireAdmin);
adminRoutes.route("/", adminSlipRoutes);
adminRoutes.route("/", adminOrderRoutes);
adminRoutes.route("/", adminConfigRoutes);
