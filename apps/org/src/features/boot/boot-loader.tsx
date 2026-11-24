"use client";

import { useIsFetching } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { cn } from "@actiontokens/ui/lib/cn";
import { BootLoader as SharedBootLoader } from "@actiontokens/ui/patterns/boot-loader";

import { anton, gothic } from "../shell/landing-fonts";

/** The Action-Tokens loading screen on every full page load (the same one the marketplace shows). */
export function BootLoader() {
  const { status } = useSession();
  const fetching = useIsFetching();
  return (
    <SharedBootLoader
      sessionReady={status !== "loading"}
      fetching={fetching}
      className={cn(anton.variable, gothic.variable)}
    />
  );
}
