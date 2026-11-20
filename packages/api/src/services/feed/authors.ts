import type { Prisma } from "@actiontokens/db";

/** Who wrote a comment, as the feed shows them. */
export const commentAuthorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  organization: { select: { name: true, slug: true } },
} satisfies Prisma.UserSelect;

type AuthorRow = Prisma.UserGetPayload<{ select: typeof commentAuthorSelect }>;

/** An artist goes by their artist name and page; a fan by their name and profile. */
export function commentAuthor(author: AuthorRow) {
  return {
    id: author.id,
    name: author.organization?.name ?? author.displayName ?? author.username ?? "Fan",
    avatarUrl: author.avatarUrl,
    href: author.organization
      ? `/artist/${author.organization.slug}`
      : author.username
        ? `/u/${author.username}`
        : null,
  };
}
