import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK } from "../look/look-value";
import {
  hotspotFormToTemplate,
  pinFormToTemplate,
  templateToHotspotForm,
  templateToPinForm,
  type HotspotFormValues,
  type PinFormValues,
} from "./mapping";

const now = new Date("2026-11-13T10:00:00Z");
const DAY = 86_400_000;

const pin = (over: Partial<PinFormValues> = {}): PinFormValues => ({
  title: " Free coffee ",
  description: "Find me",
  imageUrl: "https://cdn.example/c.png",
  link: "",
  type: "EXPERIENCE",
  visibility: "TIER",
  tierId: "t1",
  reward: { kind: "ITEM", itemId: "i1", amount: "", claimLimit: "20" },
  autoCollect: true,
  isMultiSpot: false,
  tags: ["coffee"],
  look: { ...DEFAULT_LOOK, shape: "note", color: "#0090FF" },
  radius: "50",
  spotCount: "3",
  start: null,
  end: new Date(+now + 3 * DAY),
  point: { lat: 23.8, lng: 90.4 },
  ...over,
});

describe("saving a pin form as a template", () => {
  it("keeps the details, turns the dates into a duration, and leaves empty fields out", () => {
    const data = pinFormToTemplate(pin(), { includeLocation: false, now });
    expect(data).toMatchObject({
      title: "Free coffee",
      visibility: "TIER",
      tierId: "t1",
      reward: { kind: "ITEM", itemId: "i1" },
      claimLimit: 20,
      durationMinutes: 3 * 24 * 60,
      radiusMeters: 50,
      spotCount: 3,
    });
    expect(data).not.toHaveProperty("link");
    expect(data).not.toHaveProperty("location");
  });

  it("keeps the location only when asked", () => {
    expect(pinFormToTemplate(pin(), { includeLocation: true, now }).location).toEqual({
      lat: 23.8,
      lng: 90.4,
    });
    expect(
      pinFormToTemplate(pin({ point: null }), { includeLocation: true, now }),
    ).not.toHaveProperty("location");
  });

  it("only keeps the tier while the pin is for a tier", () => {
    expect(
      pinFormToTemplate(pin({ visibility: "PUBLIC" }), { includeLocation: false, now }),
    ).not.toHaveProperty("tierId");
  });
});

describe("filling a pin form from a template", () => {
  it("brings the duration back as a fresh end date, counted from now", () => {
    const data = pinFormToTemplate(pin(), { includeLocation: true, now });
    const later = new Date("2027-01-01T08:00:00Z");
    const fill = templateToPinForm(data, later);
    expect(fill.end).toEqual(new Date(+later + 3 * DAY));
    expect(fill.point).toEqual({ lat: 23.8, lng: 90.4 });
    expect(fill).toMatchObject({
      title: "Free coffee",
      radius: "50",
      spotCount: "3",
      reward: { kind: "ITEM", itemId: "i1", claimLimit: "20" },
      look: { shape: "note", color: "#0090FF", fill: "ARTIST" },
    });
  });

  it("fills only what the template has, so the rest of the form stays as it is", () => {
    expect(templateToPinForm({ title: "Just a title" }, now)).toEqual({ title: "Just a title" });
  });
});

const area = {
  shape: "circle" as const,
  feature: {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [90.4, 23.8],
          [90.5, 23.8],
          [90.5, 23.9],
          [90.4, 23.8],
        ] as [number, number][],
      ],
    },
  },
};

const hotspot = (over: Partial<HotspotFormValues> = {}): HotspotFormValues => ({
  ...pin(),
  every: "7",
  lasts: "3",
  spots: "5",
  start: null,
  end: new Date(+now + 30 * DAY),
  area: area as never,
  ...over,
});

describe("hotspot templates", () => {
  it("saves the rhythm, the schedule length and, when asked, the area", () => {
    const data = hotspotFormToTemplate(hotspot(), { includeArea: true, now });
    expect(data).toMatchObject({
      dropEveryDays: 7,
      pinDurationDays: 3,
      spotsPerDrop: 5,
      scheduleDays: 30,
    });
    expect(data.area?.shape).toBe("circle");
    expect(hotspotFormToTemplate(hotspot(), { includeArea: false, now })).not.toHaveProperty(
      "area",
    );
  });

  it("fills a hotspot form, with a new end date", () => {
    const data = hotspotFormToTemplate(hotspot(), { includeArea: true, now });
    const fill = templateToHotspotForm(data, now);
    expect(fill).toMatchObject({ every: "7", lasts: "3", spots: "5" });
    expect(fill.end).toEqual(new Date(+now + 30 * DAY));
    expect(fill.area?.shape).toBe("circle");
  });
});
