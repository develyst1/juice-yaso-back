import { HttpError } from "./errors";

export const ORDER_STATUSES = [
  "awaiting_payment",
  "awaiting_slip_review",
  "slip_rejected",
  "in_queue",
  "packing",
  "ready_for_pickup",
  "picked_up",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SLIP_STATUSES = ["pending", "approved", "rejected"] as const;
export type SlipStatus = (typeof SLIP_STATUSES)[number];

export type Actor = "admin" | "customer" | "system";

const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  awaiting_payment: ["awaiting_slip_review", "cancelled"],
  awaiting_slip_review: ["in_queue", "slip_rejected", "cancelled"],
  slip_rejected: ["awaiting_slip_review", "cancelled"],
  in_queue: ["packing", "cancelled"],
  packing: ["ready_for_pickup"],
  ready_for_pickup: ["picked_up"],
  picked_up: [],
  cancelled: [],
};

export const CANCELABLE: ReadonlySet<OrderStatus> = new Set([
  "awaiting_payment",
  "awaiting_slip_review",
  "slip_rejected",
  "in_queue",
]);

export const SLIP_UPLOADABLE: ReadonlySet<OrderStatus> = new Set([
  "awaiting_payment",
  "slip_rejected",
]);

export const ADMIN_PATCHABLE = [
  "packing",
  "ready_for_pickup",
  "picked_up",
] as const;

export type AdminPatchStatus = (typeof ADMIN_PATCHABLE)[number];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new HttpError(
      409,
      `Invalid status transition: ${from} → ${to}`,
      "INVALID_TRANSITION",
    );
  }
}
