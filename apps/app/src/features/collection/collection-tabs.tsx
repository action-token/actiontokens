"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@actiontokens/ui/components/tabs";

import { FavoriteSongs, YourSongs } from "../music/music-view";
import { CollectionView } from "./collection-view";

/** My collection: everything you own as cards, your songs to play in full, and the songs you starred. */
export function CollectionTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const requested = useSearchParams().get("tab");
  const tab = requested === "songs" || requested === "favorites" ? requested : "all";

  return (
    <Tabs
      value={tab}
      onValueChange={(value) =>
        router.replace(value === "all" ? pathname : `${pathname}?tab=${value}`, { scroll: false })
      }
      className="gap-6"
    >
      <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
        <TabsTrigger value="all" className="font-hud flex-none">
          Everything
        </TabsTrigger>
        <TabsTrigger value="songs" className="font-hud flex-none">
          Songs
        </TabsTrigger>
        <TabsTrigger value="favorites" className="font-hud flex-none">
          Favourites
        </TabsTrigger>
      </TabsList>
      <TabsContent value="all">
        <CollectionView />
      </TabsContent>
      <TabsContent value="songs">
        <YourSongs />
      </TabsContent>
      <TabsContent value="favorites">
        <FavoriteSongs />
      </TabsContent>
    </Tabs>
  );
}
