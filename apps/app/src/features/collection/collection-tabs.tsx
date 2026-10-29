"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";

import { YourSongs } from "../music/music-view";
import { CollectionView } from "./collection-view";

/** My collection: everything you own as cards, or your songs as a list to play in full. */
export function CollectionTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const tab = useSearchParams().get("tab") === "songs" ? "songs" : "all";

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => router.replace(value === "songs" ? `${pathname}?tab=songs` : pathname, { scroll: false })}
      className="gap-6"
    >
      <TabsList className="w-fit">
        <TabsTrigger value="all" className="font-hud">
          Everything
        </TabsTrigger>
        <TabsTrigger value="songs" className="font-hud">
          Songs
        </TabsTrigger>
      </TabsList>
      <TabsContent value="all">
        <CollectionView />
      </TabsContent>
      <TabsContent value="songs">
        <YourSongs />
      </TabsContent>
    </Tabs>
  );
}
