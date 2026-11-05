"use client";

import { Check, Lock, ScanLine } from "lucide-react";
import QRCode from "react-qr-code";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@bandcoin/ui/components/dialog";

import { AR_URL } from "../shell/nav";
import type { FeedPost } from "./post-card";

/** What a post's QR opens: the AR app's scanner, which collects it straight away. */
export const collectLink = (postId: string) => `${AR_URL}/scan?post=${encodeURIComponent(postId)}`;

/**
 * "Scan to collect", as in bandfan: fans collect a post by scanning its QR
 * with the AR app. Tapping the small code shows it big. Collected posts live
 * in the AR app's collection.
 */
export function CollectQr({ post }: { post: FeedPost }) {
  const { total, collected, mine } = post.copies;
  if (post.lock || total === 0) return null;
  const left = total - collected;
  const gate = post.collect;
  if (!mine && !gate.open) {
    if (gate.reason === "OFF" || gate.reason === "LOCKED") return null;
    return (
      <span
        title={gate.message ?? undefined}
        className="text-fg-muted flex max-w-28 shrink-0 items-center gap-1 text-right text-[11px] leading-tight font-semibold"
      >
        <Lock className="size-3 shrink-0" />
        {gate.reason === "TIER"
          ? `${gate.tierName} can collect`
          : gate.reason === "SUBSCRIBE"
            ? "Subscribers can collect"
            : "Followers can collect"}
      </span>
    );
  }

  if (mine)
    return (
      <a
        href={`${AR_URL}/collection?tab=posts`}
        target="_blank"
        rel="noreferrer"
        className="bg-primary-soft text-primary-text flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
      >
        <Check className="size-3.5" /> Collected
      </a>
    );
  if (left === 0)
    return <span className="text-fg-faint shrink-0 text-xs font-semibold">All collected</span>;

  return (
    <Dialog>
      <DialogTrigger
        aria-label="Show the QR to collect this post"
        className="group grid shrink-0 justify-items-center gap-0.5"
      >
        <span className="rounded-md border bg-white p-1 transition-transform group-hover:scale-105">
          <QRCode value={collectLink(post.id)} size={44} level="M" />
        </span>
        <span className="text-fg-muted text-[10px] font-semibold">Scan to collect</span>
      </DialogTrigger>
      <DialogContent className="max-w-sm text-center">
        <DialogTitle className="text-center">Scan to collect</DialogTitle>
        <DialogDescription className="text-center">
          Open the Bandcoin AR app&apos;s scanner, or your phone&apos;s camera, and point it here.
          The post lands in your AR collection.
        </DialogDescription>
        <div className="mx-auto rounded-xl border bg-white p-4">
          <QRCode value={collectLink(post.id)} size={232} level="M" />
        </div>
        <p className="text-sm font-semibold">{post.title}</p>
        <p className="text-fg-muted text-xs">
          Free · {left} of {total} copies left · one each
        </p>
        <a
          href={`${AR_URL}/scan`}
          target="_blank"
          rel="noreferrer"
          className="text-primary-text inline-flex items-center justify-center gap-1.5 text-sm font-semibold hover:underline"
        >
          <ScanLine className="size-4" /> Open the AR scanner
        </a>
      </DialogContent>
    </Dialog>
  );
}
