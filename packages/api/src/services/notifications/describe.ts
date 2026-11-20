import type { NotificationType } from "@actiontokens/db";
import { VANITY_GRACE_DAYS, VANITY_RESERVE_DAYS } from "@actiontokens/utils/vanity";

import { describeDomain, type DomainNotice } from "../domains/notice";

export type NotificationSubject = {
  actor: { name: string; username: string | null; artistSlug: string | null };
  /** What the event is about, when it still exists */
  bounty?: { id: string; title: string } | null;
  item?: { slug: string; title: string } | null;
  /** The post a POST or REPLY is about */
  postId?: string | null;
  /** A short-link reminder: which one, for which month, which name */
  vanity?: { stage: "SOON" | "GRACE" | "LAPSED"; paidUntil: Date; name: string } | null;
  /** A custom-domain note: live, stopped working, or removed by an admin */
  domain?: DomainNotice | null;
};

const shortDay = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The three short-link reminders, for the artist's bell. */
export function describeVanity(vanity: NotificationSubject["vanity"]) {
  const href = "/settings?tab=short-link";
  if (!vanity) return { text: "Your short link needs a look.", href };
  const link = `bandcoin.io/${vanity.name}`;
  const grace = new Date(vanity.paidUntil.getTime() + VANITY_GRACE_DAYS * 86_400_000);
  switch (vanity.stage) {
    case "SOON":
      return {
        text: `${link} runs out on ${shortDay(vanity.paidUntil)}. Renew to keep it working.`,
        href,
      };
    case "GRACE":
      return {
        text: `${link} has run out. It keeps working until ${shortDay(grace)}: renew before then.`,
        href,
      };
    case "LAPSED":
      return {
        text: `${link} stopped working and now opens your artist page. The name is yours for ${VANITY_RESERVE_DAYS} more days if you renew.`,
        href,
      };
  }
}

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
    case "STORY":
      return { text: `${name} shared a story.`, href: actorPage };
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
    case "VANITY":
      return { text: describeVanity(null).text, href: null };
    case "DOMAIN":
      return { text: describeDomain(null).text, href: null };
  }
}

/** What the artist reads in the portal's bell, and the portal page it opens. */
export function describeForArtist(
  type: NotificationType,
  {
    actor,
    bounty,
    item,
    post,
    ...rest
  }: Omit<NotificationSubject, "item"> & {
    item?: { id: string; slug: string; title: string; type: string } | null;
    post?: { id: string; title: string } | null;
  },
): { text: string; href: string | null } {
  const name = actor.name;
  const postPage = post ? `/posts/${post.id}` : "/posts";
  const bountyPage = bounty ? `/bounties/${bounty.id}` : "/bounties";
  const itemPage = item
    ? item.type === "TRACK"
      ? `/music/${item.id}`
      : `/items/${item.id}`
    : null;

  switch (type) {
    case "LIKE":
      return {
        text: post ? `${name} liked your post “${post.title}”.` : `${name} liked your post.`,
        href: postPage,
      };
    case "COMMENT":
      return {
        text: post
          ? `${name} commented on your post “${post.title}”.`
          : `${name} commented on your post.`,
        href: postPage,
      };
    case "FOLLOW":
      return { text: `${name} started following you.`, href: null };
    case "PURCHASE":
      return {
        text: item ? `${name} bought ${item.title}.` : `${name} bought one of your items.`,
        href: itemPage ?? "/items",
      };
    case "MEMBERSHIP":
      return {
        text: item
          ? `${name} bought your fan token ${item.title}.`
          : `${name} joined your membership.`,
        href: "/memberships",
      };
    case "BOUNTY_JOINED":
      return {
        text: bounty
          ? `${name} joined your bounty ${bounty.title}.`
          : `${name} joined your bounty.`,
        href: bountyPage,
      };
    case "BOUNTY_SUBMISSION":
      return {
        text: bounty
          ? `${name} sent a submission to ${bounty.title}.`
          : `${name} sent a bounty submission.`,
        href: bountyPage,
      };
    case "BOUNTY_COMMENT":
      return { text: `${name} commented on your bounty.`, href: bountyPage };
    case "VANITY":
      return describeVanity(rest.vanity);
    case "DOMAIN":
      return describeDomain(rest.domain ?? null);
    default:
      return { ...describeNotification(type, { actor, bounty, item }), href: null };
  }
}
