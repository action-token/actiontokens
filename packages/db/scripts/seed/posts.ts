/**
 * Adds sample feed posts to every approved artist in the dev database, so the
 * feed has text, photo sets, videos, songs, mixed posts, members-only posts
 * and collectible copies to show. Safe to run again: a post whose title the
 * artist already has is skipped.
 *
 *   pnpm --filter @actiontokens/db seed:posts
 *   pnpm --filter @actiontokens/db seed:posts --follow <userId>   also follow them all
 */
import "dotenv/config";

import { db } from "../../src/client";
import { audio, cover } from "./demo-data";

const DEV_HOST_PREFIX = "ep-red-sea-";
const HOUR = 3_600_000;
const VIDEO = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
/** Free copies fans collect by scanning the post's QR, as for posts made in the portal. */
const COPIES = 100;

type Media = { type: "IMAGE" | "VIDEO" | "AUDIO"; url: string; title?: string };
type Access = "VIEWERS" | "FOLLOWERS" | "MEMBERS" | "NOBODY";
type Sample = {
  title: string;
  body: string;
  media: Media[];
  membersOnly?: boolean;
  /** Shows the other post settings in the feed */
  followersOnly?: boolean;
  commentAccess?: Access;
  collectAccess?: Access;
  collectibles?: number;
};

const LONG_STORY = [
  "We spent the whole week in a small room with one microphone and too much coffee.",
  "Some of it worked straight away. Most of it didn't, and that's the fun part: the bridge of the new song came from a mistake on the second night, when the drum machine kept playing after we'd stopped.",
  "Thank you for being here while we figure it out. Tell us in the comments which song you want to hear finished first.",
].join("\n\n");

function samples(name: string, slug: string, song: number): Sample[] {
  return [
    { title: "Back in the studio", body: LONG_STORY, media: [], collectAccess: "NOBODY" },
    {
      title: "Photos from last night",
      body: `What a crowd. Thank you for singing every word with ${name}.`,
      media: [1, 2, 3].map((n) => ({ type: "IMAGE", url: cover(`${slug}-night-${n}`) })),
    },
    {
      title: "A minute of the new video",
      body: "Shot it on a Sunday morning with one camera. Full video next week.",
      media: [{ type: "VIDEO", url: VIDEO }],
      followersOnly: true,
    },
    {
      title: "New song: first listen",
      body: "Rough mix, straight from the laptop. Headphones on.",
      media: [{ type: "AUDIO", url: audio(song), title: "Morning Static (rough mix)" }],
      commentAccess: "FOLLOWERS",
    },
    {
      title: "Tour diary, day 3",
      body: "A photo, the soundcheck video and the song we closed with.",
      media: [
        { type: "IMAGE", url: cover(`${slug}-tour`) },
        { type: "VIDEO", url: VIDEO },
        { type: "AUDIO", url: audio(song + 1), title: "Closing song (live)" },
      ],
      collectAccess: "FOLLOWERS",
    },
    {
      title: "For members: the demo tape",
      body: "The very first version, before anyone else heard it. Please keep it between us.",
      media: [{ type: "AUDIO", url: audio(song + 2), title: "Demo tape #1" }],
      membersOnly: true,
    },
    {
      title: "Free poster for the first 25",
      body: "Collect it below while copies last. It's yours to keep.",
      media: [{ type: "IMAGE", url: cover(`${slug}-poster`) }],
      collectibles: 25,
    },
  ];
}

const COMMENTS = [
  "On repeat all week.",
  "This is the one!",
  "Can't wait for the full version.",
  "See you at the next show.",
];

function assertDevDatabase() {
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@missing/x").hostname;
  if (!host.startsWith(DEV_HOST_PREFIX))
    throw new Error(`Refusing to add posts to ${host}: only the Bandcoin dev database.`);
}

function followArg() {
  const at = process.argv.indexOf("--follow");
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

async function main() {
  assertDevDatabase();
  const artists = await db.organization.findMany({
    where: { status: "APPROVED", NOT: { slug: { startsWith: "e2e" } } },
    select: {
      id: true,
      slug: true,
      name: true,
      userId: true,
      tiers: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      posts: { select: { title: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const fans = await db.user.findMany({
    where: { organization: null },
    select: { id: true },
    take: 8,
    orderBy: { createdAt: "asc" },
  });

  let made = 0;
  for (const [index, artist] of artists.entries()) {
    const have = new Set(artist.posts.map((post) => post.title));
    const tier = artist.tiers[0] ?? null;
    const all = samples(artist.name, artist.slug, (index % 12) + 1);
    // Each artist starts at a different kind, so neighbouring feed posts differ.
    const list = all.map((_, k) => all[(k + index) % all.length]!);
    for (const [order, sample] of list.entries()) {
      if (have.has(sample.title) || (sample.membersOnly && !tier)) continue;
      // Spread over the last few days, artists interleaved, newest first in the list.
      const createdAt = new Date(Date.now() - (order * artists.length + index + 1) * 5 * HOUR);
      const post = await db.post.create({
        data: {
          organizationId: artist.id,
          title: sample.title,
          body: sample.body,
          audience: sample.membersOnly
            ? "MEMBERS"
            : sample.followersOnly
              ? "FOLLOWERS"
              : "EVERYONE",
          tierId: sample.membersOnly ? tier!.id : null,
          commentAccess: sample.commentAccess ?? "VIEWERS",
          collectAccess: sample.collectAccess ?? "VIEWERS",
          createdAt,
          media: {
            create: sample.media.map((file, sortOrder) => ({
              type: file.type,
              url: file.url,
              title: file.title ?? null,
              sortOrder,
            })),
          },
          collectibles: {
            createMany: {
              data: Array.from({ length: sample.collectibles ?? COPIES }, () => ({})),
            },
          },
        },
      });
      const reactors = fans.filter((fan) => fan.id !== artist.userId);
      const likers = reactors.slice(0, (order + index) % (reactors.length + 1));
      if (likers.length > 0)
        await db.postLike.createMany({
          data: likers.map((fan) => ({ userId: fan.id, postId: post.id })),
          skipDuplicates: true,
        });
      if (!sample.membersOnly && reactors.length > 0 && order % 2 === 0)
        await db.postComment.create({
          data: {
            postId: post.id,
            authorId: reactors[(order + index) % reactors.length]!.id,
            body: COMMENTS[(order + index) % COMMENTS.length]!,
            createdAt: new Date(createdAt.getTime() + HOUR),
          },
        });
      made += 1;
    }
    console.log(`${artist.name}: ${artist.posts.length} before, now has the samples`);
  }
  console.log(`Added ${made} posts to ${artists.length} artists`);

  // Every post can be collected: give older posts without copies their 100.
  const bare = await db.post.findMany({
    where: { organizationId: { in: artists.map((artist) => artist.id) }, collectibles: { none: {} } },
    select: { id: true },
  });
  for (const post of bare)
    await db.postCollectible.createMany({
      data: Array.from({ length: COPIES }, () => ({ postId: post.id })),
    });
  if (bare.length > 0) console.log(`Gave ${bare.length} older posts ${COPIES} copies each`);

  const follower = followArg();
  if (follower) {
    const { count } = await db.follow.createMany({
      data: artists
        .filter((artist) => artist.userId !== follower)
        .map((artist) => ({ userId: follower, organizationId: artist.id })),
      skipDuplicates: true,
    });
    console.log(`${follower} now follows ${count} more artist${count === 1 ? "" : "s"}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
