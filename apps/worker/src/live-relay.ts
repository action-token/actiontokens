import type { Server } from "node:http";

import {
  type Context,
  type LiveConnect,
  type LiveIn,
  LiveSession,
  readTicket,
} from "@bandcoin/api";
import { type RawData, WebSocketServer } from "ws";

const text = (raw: RawData) =>
  Buffer.concat(Array.isArray(raw) ? raw : [Buffer.from(raw as ArrayBuffer)]).toString();

const MAX_MESSAGE_BYTES = 16 * 1024;

/**
 * The live music relay: the browser opens `/live?ticket=…` on the worker (the
 * ticket says who it is, signed by the API, good for a minute), and each
 * connection becomes one LiveSession. Everything else on the server is left alone.
 */
export function attachLiveRelay(
  server: Server,
  deps: { ctx: Pick<Context, "db">; connect: LiveConnect },
) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://worker");
    const userId = url.pathname === "/live" ? readTicket(url.searchParams.get("ticket")) : null;
    if (!userId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      const session = new LiveSession(deps.ctx, userId, {
        connect: deps.connect,
        send: (message) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
          if (message.type === "ended" || message.type === "error")
            setTimeout(() => ws.close(), 200);
        },
      });
      ws.on("message", (raw) => {
        try {
          const message = JSON.parse(text(raw)) as LiveIn;
          void session.handle(message).catch((error: unknown) => {
            console.error("[live] message failed", error);
          });
        } catch {
          // Not JSON: ignored.
        }
      });
      ws.on("close", () => void session.close());
      ws.on("error", () => void session.close());
      session.open().catch((error: unknown) => {
        console.error("[live] couldn't open", error);
        ws.send(
          JSON.stringify({ type: "error", message: "Live music isn't available right now." }),
        );
        ws.close();
        void session.close();
      });
    });
  });

  return {
    /** Closes every jam (each refunds its unplayed minute). */
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.close();
        wss.close(() => resolve());
      }),
  };
}
