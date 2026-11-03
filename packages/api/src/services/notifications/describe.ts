import type { NotificationType } from "@bandcoin/db";

export type NotificationSubject = {
  actor: { name: string; username: string | null; artistSlug: string | null };
  /** What the event is about, when it still exists */
  bounty?: { id: string; title: string } | null;
  item?: { slug: string; title: string } | null;
  /** The post a POST or REPLY is about */
  postId?: string | null;
};

/** What a fan reads in the bell, and where it takes them. */
export function describeNotification(
  type: NotificationType,
  { actor, bounty, item, postId }: NotificationSubject,
): { text: string; href: string | null } {
  const actorPage = actor.artistSlug
    ? `/artist/${actor.artistSlug}`
    : actor.username
      ? `/u/${actor.username}`
      : null;
  const bountyPage = bounty ? `/bounty/${bounty.id}` : null;
  const name = actor.name;
  const postPage = postId ? `/feed/${postId}` : "/feed";

  switch (type) {
    case "BOUNTY_WINNER":
      return {
        text: bounty
          ? `${name} picked you as a winner of ${bounty.title}. Claim your prize.`
          : `${name} picked you as a bounty winner.`,
        href: bountyPage,
      };
    case "BOUNTY":
      return {
        text: bounty
          ? `${name} posted a new bounty: ${bounty.title}`
          : `${name} posted a new bounty.`,
        href: bountyPage ?? actorPage,
      };
    case "BOUNTY_JOINED":
      return { text: `${name} joined your bounty.`, href: bountyPage };
    case "BOUNTY_SUBMISSION":
      return { text: `${name} sent a bounty submission.`, href: bountyPage };
    case "BOUNTY_COMMENT":
      return { text: `${name} commented on a bounty.`, href: bountyPage };
    case "POST":
      return { text: `${name} shared a new post.`, href: postPage };
    case "NEW_ITEM":
      return {
        text: item ? `${name} released ${item.title}.` : `${name} released something new.`,
        href: item ? `/item/${item.slug}` : actorPage,
      };
    case "FOLLOW":
      return { text: `${name} started following you.`, href: actorPage };
    case "LIKE":
      return { text: `${name} liked your post.`, href: actorPage };
    case "COMMENT":
      return { text: `${name} commented on your post.`, href: actorPage };
    case "REPLY":
      return { text: `${name} replied to your comment.`, href: postPage };
    case "MEMBERSHIP":
      return { text: `${name} joined a membership.`, href: actorPage };
    case "PURCHASE":
      return { text: `${name} bought something.`, href: item ? `/item/${item.slug}` : actorPage };
  }
}
