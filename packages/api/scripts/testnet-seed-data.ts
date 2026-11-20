/**
 * The invented ActionTokens organizations, fans and murals that `testnet-seed.ts` puts on the dev
 * database and Stellar testnet. Organizations are a mix of what ActionTokens is for: a cause, a
 * brand, a venue, an artist crew, a café and an arcade. Most sit in Dhaka; one each in New York
 * and London so the map has other cities too.
 */

export type SeedItem = {
  code: string;
  title: string;
  type: "IMAGE" | "MERCH" | "TICKET";
  description: string;
  price: number; // ACTION
  supply: number;
};

export type SeedPin = {
  title: string;
  type: "LAUNCH" | "EXPERIENCE" | "EVENT" | "LANDMARK";
  description: string;
  /** Metres from the org's spot. */
  north: number;
  east: number;
  /** Rewards the org token (amount) or, when null, one copy of the first item. */
  tokenReward: number | null;
};

export type SeedOrg = {
  slug: string;
  name: string;
  kind: string;
  bio: string;
  website: string;
  token: string;
  tokenPrice: number;
  city: string;
  area: string;
  lat: number;
  lng: number;
  items: SeedItem[];
  event: { title: string; description: string; venue: string; inDays: number };
  pins: SeedPin[];
  bounty: { title: string; summary: string; description: string; instructions: string[]; prize: number; winners: number };
  posts: { title: string; body: string }[];
};

export const ORGS: SeedOrg[] = [
  {
    slug: "clean-coast-dhaka",
    name: "Clean Coast Dhaka",
    kind: "Cause",
    bio: "Volunteers cleaning Dhaka's lakes and riverbanks every weekend. Every bag you fill earns $CLEAN.",
    website: "https://example.org/clean-coast",
    token: "CLEAN",
    tokenPrice: 20,
    city: "Dhaka",
    area: "Hatirjheel",
    lat: 23.757,
    lng: 90.406,
    items: [
      { code: "CLEANBADGE", title: "Lake Guardian badge", type: "IMAGE", description: "For everyone who joined a Hatirjheel cleanup.", price: 150, supply: 500 },
      { code: "CLEANTEE", title: "Clean Coast crew tee", type: "MERCH", description: "Recycled cotton, printed in Dhaka. Pick up at any cleanup.", price: 1200, supply: 120 },
      { code: "CLEANPASS", title: "Riverbank day pass", type: "TICKET", description: "Boat ride and lunch on the big Buriganga cleanup day.", price: 600, supply: 60 },
    ],
    event: { title: "Hatirjheel lake cleanup", description: "Gloves, bags and tea provided. Bring a friend.", venue: "Hatirjheel amphitheatre", inDays: 5 },
    pins: [
      { title: "Cleanup check-in", type: "EVENT", description: "Check in at the amphitheatre steps on cleanup day.", north: 120, east: -80, tokenReward: 10 },
      { title: "Lake Guardian drop", type: "LAUNCH", description: "Collect the Lake Guardian badge by the bridge.", north: -260, east: 210, tokenReward: null },
      { title: "Bridge viewpoint", type: "LANDMARK", description: "The best view of the lake. A little $CLEAN for the walk.", north: 380, east: 330, tokenReward: 5 },
    ],
    bounty: {
      title: "Fill a bag on the lake path",
      summary: "Pick up litter along Hatirjheel and show us the full bag.",
      description: "Take a photo of your full bag with the lake behind it. Three volunteers win a share of the prize.",
      instructions: ["Fill at least one bag", "Photo with the lake behind it", "Drop the bag at a city bin"],
      prize: 900,
      winners: 3,
    },
    posts: [
      { title: "212 bags last Saturday", body: "Thank you all. The east bank is the cleanest it has been all year." },
      { title: "Next stop: Buriganga", body: "Big riverbank day next month. Day passes are in the drops." },
    ],
  },
  {
    slug: "volt-kicks",
    name: "Volt Kicks",
    kind: "Brand",
    bio: "Dhaka streetwear and sneaker customs. Hunt our drops around Banani before they sell out.",
    website: "https://example.com/volt-kicks",
    token: "VOLT",
    tokenPrice: 45,
    city: "Dhaka",
    area: "Banani",
    lat: 23.794,
    lng: 90.4043,
    items: [
      { code: "VOLTSTICKER", title: "Volt sticker pack", type: "IMAGE", description: "Eight die-cut stickers, digital and physical.", price: 90, supply: 1000 },
      { code: "VOLTHOODIE", title: "Neon Volt hoodie", type: "MERCH", description: "Heavyweight hoodie with the neon bolt on the back.", price: 4500, supply: 80 },
      { code: "VOLTVIP", title: "Custom session VIP", type: "TICKET", description: "Bring your pair; we paint them with you in the studio.", price: 8000, supply: 20 },
    ],
    event: { title: "Volt drop night", description: "New colourway, live customs and a DJ until late.", venue: "Volt studio, Road 11", inDays: 9 },
    pins: [
      { title: "Hoodie hunt", type: "LAUNCH", description: "The Neon Volt drop is hidden near the lake park.", north: 200, east: 150, tokenReward: null },
      { title: "Studio door", type: "EXPERIENCE", description: "Say hi at the studio and grab some $VOLT.", north: -90, east: -60, tokenReward: 8 },
      { title: "Drop night entry", type: "EVENT", description: "Check in on drop night.", north: -320, east: 240, tokenReward: 12 },
    ],
    bounty: {
      title: "Style the Volt bolt",
      summary: "Post a fit with anything Volt in it.",
      description: "Show us how you wear Volt. Two best fits win, and we repost them.",
      instructions: ["Wear anything Volt", "Full-body photo outdoors", "Tag the spot"],
      prize: 1500,
      winners: 2,
    },
    posts: [
      { title: "New colourway Friday", body: "Neon on black. Members see it first." },
      { title: "Customs are back", body: "Studio sessions open again; VIP passes in the drops." },
    ],
  },
  {
    slug: "rooftop-records",
    name: "Rooftop Records",
    kind: "Venue",
    bio: "A record bar on a Dhanmondi rooftop. Live sets every Thursday, vinyl every day.",
    website: "https://example.com/rooftop-records",
    token: "ROOF",
    tokenPrice: 30,
    city: "Dhaka",
    area: "Dhanmondi",
    lat: 23.7461,
    lng: 90.3742,
    items: [
      { code: "ROOFENTRY", title: "Thursday live entry", type: "TICKET", description: "One entry to any Thursday live set.", price: 500, supply: 200 },
      { code: "ROOFPOSTER", title: "Sunset sessions poster", type: "IMAGE", description: "Signed by everyone who played this season.", price: 250, supply: 300 },
      { code: "ROOFTOTE", title: "Record tote", type: "MERCH", description: "Fits twelve LPs. Barely.", price: 900, supply: 150 },
    ],
    event: { title: "Thursday rooftop live", description: "Three local acts, golden hour to midnight.", venue: "Rooftop Records, Road 27", inDays: 3 },
    pins: [
      { title: "Rooftop stairs", type: "EXPERIENCE", description: "Top of the stairs, before the door.", north: 60, east: 40, tokenReward: 6 },
      { title: "Lake-side listening", type: "LANDMARK", description: "Dhanmondi lake, where the sunset sessions started.", north: -350, east: -150, tokenReward: 4 },
      { title: "Poster drop", type: "LAUNCH", description: "Collect the sunset sessions poster.", north: 240, east: -280, tokenReward: null },
    ],
    bounty: {
      title: "Your best rooftop moment",
      summary: "Share a clip from any Thursday set.",
      description: "Up to 30 seconds from the crowd. Best clip opens next week's set.",
      instructions: ["Up to 30 seconds", "From a Thursday set", "Sound on"],
      prize: 750,
      winners: 1,
    },
    posts: [
      { title: "This Thursday", body: "Three acts, one sunset. Doors at 5." },
      { title: "New crates in", body: "Old Bangla funk and a box of Japanese city pop." },
    ],
  },
  {
    slug: "spray-crew-bd",
    name: "Spray Crew BD",
    kind: "Artist crew",
    bio: "A street-art crew painting walls across Gulshan and Old Dhaka. Find a wall, collect it.",
    website: "https://example.com/spray-crew",
    token: "SPRAY",
    tokenPrice: 25,
    city: "Dhaka",
    area: "Gulshan",
    lat: 23.7808,
    lng: 90.4167,
    items: [
      { code: "SPRAYTIGER", title: "Neon tiger print", type: "IMAGE", description: "Digital print of the Gulshan 2 tiger wall.", price: 400, supply: 150 },
      { code: "SPRAYCAN", title: "Crew can (signed)", type: "MERCH", description: "An empty can from the tiger wall, signed by the crew.", price: 2000, supply: 30 },
      { code: "SPRAYTOUR", title: "Wall walk tour", type: "TICKET", description: "Two-hour walk to five walls with the artists.", price: 700, supply: 40 },
    ],
    event: { title: "Live wall: Gulshan 2", description: "Watch a new wall go up from sketch to finish.", venue: "Gulshan 2 circle, east wall", inDays: 12 },
    pins: [
      { title: "Tiger wall", type: "LANDMARK", description: "The neon tiger. Stand back to see the whole thing.", north: 140, east: 190, tokenReward: 7 },
      { title: "Tiger print drop", type: "LAUNCH", description: "Collect the tiger print at the wall.", north: 150, east: 210, tokenReward: null },
      { title: "Live wall check-in", type: "EVENT", description: "Check in while the wall is going up.", north: -230, east: -120, tokenReward: 10 },
    ],
    bounty: {
      title: "Spot a Spray Crew wall",
      summary: "Find one of our walls we haven't put on the map.",
      description: "Photo of the wall and a rough location. Every new wall found wins.",
      instructions: ["Photo of the full wall", "Rough location", "Not already on the map"],
      prize: 1200,
      winners: 4,
    },
    posts: [
      { title: "Tiger is done", body: "Four nights, 62 cans. Go see it at night." },
      { title: "Old Dhaka next", body: "Members get the location a day early." },
    ],
  },
  {
    slug: "green-cup-coffee",
    name: "Green Cup Coffee",
    kind: "Brand",
    bio: "A Lower East Side café that pays you in $GCUP for bringing your own cup.",
    website: "https://example.com/green-cup",
    token: "GCUP",
    tokenPrice: 15,
    city: "New York",
    area: "Lower East Side",
    lat: 40.7223,
    lng: -73.9874,
    items: [
      { code: "GCUPCARD", title: "Ten-coffee card", type: "TICKET", description: "Ten filter coffees, any day.", price: 2200, supply: 300 },
      { code: "GCUPMUG", title: "Green Cup mug", type: "MERCH", description: "The one behind the counter.", price: 1500, supply: 100 },
      { code: "GCUPART", title: "Latte art print", type: "IMAGE", description: "Our barista's best pour, as a print.", price: 120, supply: 500 },
    ],
    event: { title: "Latte art throwdown", description: "Bring your pitcher. Winner pours for a week.", venue: "Green Cup, Orchard St", inDays: 7 },
    pins: [
      { title: "Bring your cup", type: "EXPERIENCE", description: "Show your own cup at the counter.", north: 30, east: 20, tokenReward: 5 },
      { title: "Latte art drop", type: "LAUNCH", description: "Collect the latte art print.", north: -200, east: 150, tokenReward: null },
    ],
    bounty: {
      title: "Reusable cup week",
      summary: "Use your own cup five days in a row.",
      description: "A photo of your cup each day. Two people win a year of coffee money.",
      instructions: ["Five days in a row", "One photo a day", "Any café counts"],
      prize: 800,
      winners: 2,
    },
    posts: [{ title: "3,000 cups saved", body: "That's three thousand fewer paper cups this year." }],
  },
  {
    slug: "pixel-park-london",
    name: "Pixel Park",
    kind: "Venue",
    bio: "A Shoreditch arcade bar with retro cabinets and weekly high-score nights.",
    website: "https://example.com/pixel-park",
    token: "PIXEL",
    tokenPrice: 35,
    city: "London",
    area: "Shoreditch",
    lat: 51.5246,
    lng: -0.0786,
    items: [
      { code: "PIXELPASS", title: "Free-play night pass", type: "TICKET", description: "Every cabinet on free play, one night.", price: 1000, supply: 120 },
      { code: "PIXELPIN", title: "8-bit enamel pin", type: "MERCH", description: "The Pixel Park ghost.", price: 450, supply: 250 },
      { code: "PIXELHIGH", title: "High-score card", type: "IMAGE", description: "Proof you topped a board.", price: 80, supply: 999 },
    ],
    event: { title: "High-score Wednesday", description: "Top three on any board win $PIXEL.", venue: "Pixel Park, Rivington St", inDays: 4 },
    pins: [
      { title: "Cabinet row", type: "EXPERIENCE", description: "Find the ghost cabinet.", north: 40, east: -30, tokenReward: 6 },
      { title: "High-score drop", type: "LAUNCH", description: "Collect a high-score card.", north: 180, east: 220, tokenReward: null },
    ],
    bounty: {
      title: "Beat the house score",
      summary: "Top our Pac-style cabinet's house score.",
      description: "Photo of the board with your initials on top.",
      instructions: ["Photo of the high-score board", "Your initials on top"],
      prize: 600,
      winners: 3,
    },
    posts: [{ title: "New cabinet", body: "A rare one just arrived. Come and lose to it." }],
  },
];

export const FANS = [
  { username: "rafi.walks", displayName: "Rafi" },
  { username: "nadia.drops", displayName: "Nadia" },
  { username: "tanvir.ar", displayName: "Tanvir" },
  { username: "maya.collects", displayName: "Maya" },
  { username: "leo.street", displayName: "Leo" },
];

export const MURALS = [
  { title: "Rickshaw rainbow", lat: 23.7799, lng: 90.4153 },
  { title: "Old Dhaka tiger", lat: 23.7104, lng: 90.4074 },
  { title: "Dhanmondi koels", lat: 23.7449, lng: 90.3779 },
  { title: "Banani blue whale", lat: 23.7961, lng: 90.4021 },
  { title: "Orchard St cups", lat: 40.7208, lng: -73.9888 },
];
