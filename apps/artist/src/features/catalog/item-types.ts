import type { RouterInputs } from "~/trpc/react";

export type ItemKind = RouterInputs["catalog"]["create"]["type"];
type MediaKind = NonNullable<RouterInputs["catalog"]["create"]["media"]>["mediaType"];

/** The kinds of collectible an artist can create, with the words the form uses for each. */
export const ITEM_TYPES: { value: ItemKind; label: string; hint: string }[] = [
  { value: "IMAGE", label: "Artwork", hint: "An image people collect" },
  { value: "VIDEO", label: "Video", hint: "A clip or a film" },
  { value: "MODEL_3D", label: "3D model", hint: "A .glb or .gltf file" },
  { value: "DOCUMENT", label: "Document", hint: "A PDF, lyrics or a zine" },
  { value: "TICKET", label: "Ticket", hint: "Entry to a show or event" },
  { value: "MERCH", label: "Merch", hint: "Something physical you ship" },
  { value: "ROYALTY", label: "Royalty share", hint: "Holders split a share of your revenue" },
];

/** Art, video, 3D and documents are the file itself, so they can't exist without it. */
export const fileRequired = (type: ItemKind) =>
  type === "IMAGE" || type === "VIDEO" || type === "MODEL_3D" || type === "DOCUMENT";

/** What the file picker offers for this kind of item. */
export function acceptFor(type: ItemKind): string {
  switch (type) {
    case "IMAGE":
      return "image/*";
    case "VIDEO":
      return "video/*";
    case "MODEL_3D":
      return ".glb,.gltf,model/gltf-binary,model/gltf+json";
    default:
      return "application/pdf,image/*,video/*,.txt";
  }
}

/** The media type to store for the picked file. 3D files often have no mime type, so the item type decides. */
export function mediaTypeFor(mime: string, type: ItemKind): MediaKind {
  if (type === "MODEL_3D") return "MODEL_3D";
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";
  return "DOCUMENT";
}
