import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@actiontokens/ui/lib/cn";

import type { RouterOutputs } from "~/trpc/react";

import { Avatar } from "../shell/context-panel";

type Person = RouterOutputs["bounty"]["byId"]["participantList"][number]["user"];

export const nameOf = (person: Person) =>
  person.displayName ?? (person.username ? `@${person.username}` : "Anonymous");

export function PersonAvatar({ person, className }: { person: Person; className?: string }) {
  return (
    <Avatar
      name={nameOf(person).replace(/^@/, "")}
      url={person.avatarUrl}
      className={cn(
        "bg-surface-3 grid shrink-0 place-items-center rounded-full object-cover text-[10px] font-bold",
        className,
      )}
    />
  );
}

export function PersonLink({
  person,
  className,
  children,
}: {
  person: Person;
  className?: string;
  children: ReactNode;
}) {
  return person.username ? (
    <Link href={`/u/${person.username}`} className={cn("hover:underline", className)}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}
