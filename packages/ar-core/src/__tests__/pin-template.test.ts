import { describe, expect, it } from "vitest";

import {
  datesFromDays,
  datesFromMinutes,
  daysBetween,
  describeMinutes,
  hotspotTemplateDataSchema,
  minutesBetween,
  pinTemplateDataSchema,
  readTemplateData,
  templateHasLocation,
  templateNameSchema,
} from "../pin-template";

const square = {
  type: "Feature" as const,
  properties: {},
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [90.41, 23.81],
        [90.42, 23.81],
        [90.42, 23.82],
        [90.41, 23.82],
        [90.41, 23.81],
      ] as [number, number][],
    ],
  },
};

describe("saving a template", () => {
  it("accepts a half-filled pin template", () => {
    expect(pinTemplateDataSchema.safeParse({ title: "Free coffee" }).success).toBe(true);
  });

  it("needs a name", () => {
    expect(templateNameSchema.safeParse("  ").success).toBe(false);
    expect(templateNameSchema.parse("  Coffee  ")).toBe("Coffee");
  });

  it("rejects an area whose outline isn't closed", () => {
    const open = structuredClone(square);
    open.geometry.coordinates[0]!.pop();
    open.geometry.coordinates[0]!.push([90.43, 23.83]);
    expect(
      hotspotTemplateDataSchema.safeParse({ area: { shape: "polygon", feature: open } }).success,
    ).toBe(false);
  });

  it("accepts a hotspot template with its area, and a pin with a reward and a look", () => {
    expect(
      hotspotTemplateDataSchema.safeParse({
        scheduleDays: 30,
        area: { shape: "rectangle", feature: square },
      }).success,
    ).toBe(true);
    expect(
      pinTemplateDataSchema.safeParse({
        reward: { kind: "ITEM", itemId: "i1" },
        look: { shape: "note", fill: "PIN" },
        visibility: "TIER",
        tierId: "t1",
      }).success,
    ).toBe(true);
  });

  it("rejects a location off the globe", () => {
    expect(pinTemplateDataSchema.safeParse({ location: { lat: 123, lng: 0 } }).success).toBe(false);
  });
});

describe("reading a saved template", () => {
  it("keeps the good fields and drops the broken ones", () => {
    expect(
      readTemplateData("PIN", {
        title: "Coffee",
        spotCount: "lots",
        location: { lat: 999, lng: 0 },
        radiusMeters: 40,
      }),
    ).toEqual({ title: "Coffee", radiusMeters: 40 });
  });

  it("opens anything, even garbage, as an empty template", () => {
    expect(readTemplateData("PIN", null)).toEqual({});
    expect(readTemplateData("HOTSPOT", "nope")).toEqual({});
    expect(readTemplateData("PIN", [1, 2])).toEqual({});
  });

  it("ignores fields of the other kind", () => {
    expect(readTemplateData("HOTSPOT", { radiusMeters: 10, dropEveryDays: 2 })).toEqual({
      dropEveryDays: 2,
    });
  });

  it("knows whether a location or area is included", () => {
    expect(templateHasLocation("PIN", { location: { lat: 1, lng: 2 } })).toBe(true);
    expect(templateHasLocation("PIN", {})).toBe(false);
    expect(templateHasLocation("HOTSPOT", { area: { shape: "polygon", feature: square } })).toBe(
      true,
    );
  });
});

describe("durations", () => {
  const start = new Date("2026-11-08T10:00:00Z");

  it("round-trips minutes", () => {
    const end = new Date("2026-11-11T12:30:00Z");
    const { start: s, end: e } = datesFromMinutes(minutesBetween(start, end), start);
    expect(s.getTime()).toBe(start.getTime());
    expect(e.getTime()).toBe(end.getTime());
  });

  it("never gives zero or less", () => {
    expect(minutesBetween(start, start)).toBe(1);
    expect(daysBetween(start, new Date(start.getTime() - 1000))).toBe(1);
  });

  it("round-trips days", () => {
    expect(daysBetween(start, datesFromDays(30, start).end)).toBe(30);
  });

  it("reads naturally", () => {
    expect(describeMinutes(3 * 24 * 60)).toBe("3 days");
    expect(describeMinutes(26 * 60)).toBe("1 day 2 hours");
    expect(describeMinutes(90)).toBe("1 hour 30 minutes");
  });
});
