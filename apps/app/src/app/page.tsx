import Link from "next/link";

import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";

/** Placeholder home until phase 4 builds the real one. */
export default function HomePage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-content-center gap-5 px-4">
      <BrandMark className="size-12" />
      <h1 className="text-4xl font-extrabold">Bandcoin</h1>
      <p className="text-fg-muted">The new Bandcoin app is being built. The design system is ready to review.</p>
      <Link href="/design" className="text-primary-text font-semibold hover:underline">
        Open the design preview →
      </Link>
    </main>
  );
}
