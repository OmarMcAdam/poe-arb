import type { Quote } from "../store/storage";

export function quoteIsValid(q: Quote | null | undefined): q is Quote {
  if (!q) return false;
  if (!Number.isFinite(q.payQty) || !Number.isFinite(q.receiveQty)) return false;
  if (q.payQty <= 0 || q.receiveQty <= 0) return false;
  return true;
}

// Converts an amount expressed in q.pay units to q.receive units.
export function convertUsingQuote(amountPay: number, q: Quote): number | null {
  if (!quoteIsValid(q)) return null;
  if (!Number.isFinite(amountPay) || amountPay < 0) return null;
  return amountPay * (q.receiveQty / q.payQty);
}

// Returns pay units per 1 receive unit.
export function payPerReceive(q: Quote): number | null {
  if (!quoteIsValid(q)) return null;
  return q.payQty / q.receiveQty;
}
