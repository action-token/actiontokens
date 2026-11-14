import { beforeEach, describe, expect, it } from "vitest";

import { useLastPin } from "./last-pin";
import { useMapFormCard } from "./map-form-card";

describe("the Pins map's form card", () => {
  beforeEach(() => useMapFormCard.setState({ card: null, at: null, draft: null, draftArea: null }));

  it("opens a card with the spot that was clicked, and moves the spot", () => {
    const { open, moveTo } = useMapFormCard.getState();
    open({ kind: "newPin" }, { lat: 1, lng: 2 });
    expect(useMapFormCard.getState()).toMatchObject({
      card: { kind: "newPin" },
      at: { lat: 1, lng: 2 },
    });
    moveTo({ lat: 3, lng: 4 });
    expect(useMapFormCard.getState().at).toEqual({ lat: 3, lng: 4 });
  });

  it("opens an edit card without a spot, and closing clears both", () => {
    const { open, close } = useMapFormCard.getState();
    open({ kind: "editPin", id: "p1" });
    expect(useMapFormCard.getState()).toMatchObject({
      card: { kind: "editPin", id: "p1" },
      at: null,
    });
    close();
    expect(useMapFormCard.getState()).toMatchObject({ card: null, at: null });
  });
});

describe("the last pin made in a card", () => {
  beforeEach(() => useLastPin.setState({ last: null }));

  it("is remembered for the next card, and forgotten on Clear", () => {
    useLastPin.getState().remember({ title: "Free coffee", spotCount: 3 });
    expect(useLastPin.getState().last).toEqual({ title: "Free coffee", spotCount: 3 });
    useLastPin.getState().forget();
    expect(useLastPin.getState().last).toBeNull();
  });

  it("keeps the pin's look as drawn so far, and drops it when the card closes or reopens", () => {
    const draft = {
      path: "M0 0",
      anchor: "center" as const,
      color: "#22c55e",
      imageUrl: null,
      imageFit: null,
      badge: false,
    };
    const { open, setDraft, close } = useMapFormCard.getState();
    open({ kind: "newPin" }, { lat: 1, lng: 2 });
    setDraft(draft);
    expect(useMapFormCard.getState().draft).toEqual(draft);
    close();
    expect(useMapFormCard.getState().draft).toBeNull();
    setDraft(draft);
    open({ kind: "newPin" });
    expect(useMapFormCard.getState().draft).toBeNull();
  });

  it("keeps the area of a new hotspot on the map while its card is open", () => {
    const { open, setDraftArea, close } = useMapFormCard.getState();
    open({ kind: "newHotspot" });
    setDraftArea({ feature: { type: "Feature" } });
    expect(useMapFormCard.getState().draftArea).toEqual({ feature: { type: "Feature" } });
    close();
    expect(useMapFormCard.getState().draftArea).toBeNull();
    setDraftArea({ feature: {} });
    open({ kind: "newHotspot" });
    expect(useMapFormCard.getState().draftArea).toBeNull();
  });
});
