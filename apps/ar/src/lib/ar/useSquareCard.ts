"use client";

import { useEffect, useRef, useState } from "react";

/** The slice of Square's Web Payments SDK this form uses. */
type SquareCard = {
  attach(selector: string | HTMLElement): Promise<void>;
  tokenize(): Promise<{ status: string; token?: string; errors?: { message: string }[] }>;
  destroy(): Promise<void>;
};
type SquarePayments = { card(): Promise<SquareCard> };
declare global {
  interface Window {
    Square?: { payments(appId: string, locationId: string): SquarePayments };
  }
}

const APP_ID = process.env.NEXT_PUBLIC_SQUARE_APP_ID ?? "";
const LOCATION_ID = process.env.NEXT_PUBLIC_SQUARE_LOCATION ?? "";
const CONFIGURED = Boolean(APP_ID && LOCATION_ID);
const SCRIPT_URL = APP_ID.startsWith("sandbox-")
  ? "https://sandbox.web.squarecdn.com/v1/square.js"
  : "https://web.squarecdn.com/v1/square.js";

let scriptLoad: Promise<void> | null = null;
function loadSquare() {
  scriptLoad ??= new Promise((resolve, reject) => {
    if (window.Square) return resolve();
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoad = null;
      reject(new Error("Couldn't load the card form."));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

/**
 * Square's card field. Card numbers never touch Action Tokens' servers: `tokenize`
 * returns a one-time token the server charges with. A copy of the fan app's
 * (apps can't import each other); the field itself is styled where it's placed.
 */
export function useSquareCard(enabled: boolean) {
  const container = useRef<HTMLDivElement>(null);
  const card = useRef<SquareCard | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !CONFIGURED || !container.current) return;
    let disposed = false;
    setState("loading");
    loadSquare()
      .then(async () => {
        const created = await window.Square!.payments(APP_ID, LOCATION_ID).card();
        if (disposed || !container.current) return void created.destroy();
        await created.attach(container.current);
        card.current = created;
        setState("ready");
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        setState("error");
        setError(cause instanceof Error ? cause.message : "Couldn't load the card form.");
      });
    return () => {
      disposed = true;
      void card.current?.destroy();
      card.current = null;
    };
  }, [enabled]);

  /** A one-time card token, or null with the reason shown under the field. */
  async function tokenize() {
    if (!card.current) return null;
    setError(null);
    const result = await card.current.tokenize();
    if (result.status === "OK" && result.token) return { sourceId: result.token };
    setError(result.errors?.[0]?.message ?? "Check your card details.");
    return null;
  }

  return {
    container,
    ready: state === "ready",
    loading: state === "loading",
    error: CONFIGURED ? error : "Card payments aren't set up yet.",
    tokenize,
  };
}
