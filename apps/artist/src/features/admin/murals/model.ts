import type { RouterOutputs } from "~/trpc/react";

export type MuralRow = RouterOutputs["admin"]["murals"]["list"]["murals"][number];
export type MuralDetail = RouterOutputs["admin"]["murals"]["get"];
export type Status = MuralRow["status"];
export type RejectReason = "NOT_A_MURAL" | "FRAUD";

/** Tabs on mural review. `settings` isn't a status. */
export type View = "pending" | "gathering" | "approved" | "rejected" | "settings";

export const VIEW_STATUS: Record<Exclude<View, "settings">, Status> = {
  pending: "PENDING",
  gathering: "DISCOVERED",
  approved: "APPROVED",
  rejected: "REJECTED",
};

export const REJECT_LABEL: Record<RejectReason, string> = { NOT_A_MURAL: "Not a mural", FRAUD: "Fraud / spam" };

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");
