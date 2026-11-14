import { describe, expect, it } from "vitest";

import { AUTO_KEY, flipSwitch, LIVE_KEYS } from "./keys";

const off = { muteBass: false, muteDrums: false, onlyBassAndDrums: false };

describe("live jam keys", () => {
  it("offers Auto and the twelve keys, each named once", () => {
    expect(LIVE_KEYS).toHaveLength(13);
    expect(LIVE_KEYS[0]).toEqual({ value: AUTO_KEY, label: "Auto" });
    expect(new Set(LIVE_KEYS.map((key) => key.label)).size).toBe(13);
  });

  it("uses Lyria's own names, the ones the server accepts (services/studio/lyria LIVE_SCALES)", () => {
    expect(LIVE_KEYS.map((key) => key.value)).toEqual([
      "SCALE_UNSPECIFIED",
      "C_MAJOR_A_MINOR",
      "D_FLAT_MAJOR_B_FLAT_MINOR",
      "D_MAJOR_B_MINOR",
      "E_FLAT_MAJOR_C_MINOR",
      "E_MAJOR_D_FLAT_MINOR",
      "F_MAJOR_D_MINOR",
      "G_FLAT_MAJOR_E_FLAT_MINOR",
      "G_MAJOR_E_MINOR",
      "A_FLAT_MAJOR_F_MINOR",
      "A_MAJOR_G_FLAT_MINOR",
      "B_FLAT_MAJOR_G_MINOR",
      "B_MAJOR_A_FLAT_MINOR",
    ]);
  });
});

describe("the bass and drums switches", () => {
  it("lets both mutes be on together", () => {
    const bass = flipSwitch(off, "muteBass", true);
    expect(flipSwitch(bass, "muteDrums", true)).toEqual({
      muteBass: true,
      muteDrums: true,
      onlyBassAndDrums: false,
    });
  });

  it("turns the mutes off for only-bass-and-drums, and the other way round", () => {
    const muted = { muteBass: true, muteDrums: true, onlyBassAndDrums: false };
    const only = flipSwitch(muted, "onlyBassAndDrums", true);
    expect(only).toEqual({ muteBass: false, muteDrums: false, onlyBassAndDrums: true });
    expect(flipSwitch(only, "muteDrums", true)).toEqual({
      muteBass: false,
      muteDrums: true,
      onlyBassAndDrums: false,
    });
    expect(flipSwitch(only, "onlyBassAndDrums", false)).toEqual(off);
  });
});
