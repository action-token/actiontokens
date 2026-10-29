import { AppError, ErrorCodes, requireEnv } from "@bandcoin/errors";

/**
 * Card payments through Square's REST API. Always charge before submitting a
 * delivery transaction, with the amount computed on the server, and use the
 * order id as the idempotency key so a retry can never charge twice.
 */

const API_VERSION = "2025-01-23";

const baseUrl = () =>
  process.env.SQUARE_ENVIRONMENT?.toLowerCase() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

async function call<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("SQUARE_ACCESS_TOKEN", process.env.SQUARE_ACCESS_TOKEN)}`,
      "Content-Type": "application/json",
      "Square-Version": API_VERSION,
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { errors?: { code?: string; detail?: string }[] };
  if (!response.ok) {
    const detail =
      data.errors?.map((error) => error.detail ?? error.code).join("; ") ?? response.statusText;
    throw new AppError(ErrorCodes.PAYMENT_FAILED, {
      message: `Card payment failed: ${detail}`,
      details: { path },
    });
  }
  return data;
}

export async function chargeCard(input: {
  orderId: string;
  sourceId: string;
  cents: number;
  verificationToken?: string;
}): Promise<{ paymentId: string }> {
  if (!Number.isInteger(input.cents) || input.cents <= 0) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Invalid card amount" });
  }
  const data = await call<{ payment: { id: string } }>("/v2/payments", {
    idempotency_key: input.orderId,
    source_id: input.sourceId,
    verification_token: input.verificationToken,
    amount_money: { amount: input.cents, currency: "USD" },
    reference_id: input.orderId,
  });
  return { paymentId: data.payment.id };
}

export async function refundCard(input: { orderId: string; paymentId: string; cents: number }) {
  await call("/v2/refunds", {
    idempotency_key: `refund-${input.orderId}`,
    payment_id: input.paymentId,
    amount_money: { amount: input.cents, currency: "USD" },
    reason: "Delivery failed",
  });
}
