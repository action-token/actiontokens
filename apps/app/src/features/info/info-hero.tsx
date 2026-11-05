import type { ReactNode } from "react";

/**
 * The top of an info page: a full-width yellow band with the title in big
 * type, a hand-written line under it and room for buttons. Place it above the
 * page body so it runs edge to edge.
 */
export function InfoHero({
  eyebrow,
  title,
  note,
  children,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <header className="bg-primary text-primary-foreground border-fg relative isolate overflow-hidden border-b-[3px]">
      <span
        aria-hidden
        className="bg-bg/15 absolute -top-24 -right-16 -z-10 size-72 rounded-full sm:size-[26rem]"
      />
      <span
        aria-hidden
        className="bg-bg/10 absolute right-1/4 -bottom-28 -z-10 size-52 rounded-full sm:size-72"
      />
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-xs font-bold tracking-[0.18em] uppercase opacity-70">{eyebrow}</p>
        <h1 className="display mt-2 max-w-3xl text-5xl leading-[1.02] text-balance sm:text-7xl">
          {title}
        </h1>
        {note && <p className="marker mt-3 -rotate-1 text-xl opacity-80 sm:text-2xl">{note}</p>}
        {children && <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>}
      </div>
    </header>
  );
}
