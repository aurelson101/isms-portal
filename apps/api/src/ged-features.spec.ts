import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { gedFeatures, requireGedFeature } from "./ged-settings";

const store = (value: unknown) =>
  ({
    applicationSetting: {
      findUnique: vi.fn().mockResolvedValue(value ? { value } : null),
    },
  }) as never;

describe("GED viewer modules", () => {
  it("are enabled until an administrator turns them off", async () => {
    await expect(gedFeatures(store(null))).resolves.toEqual({
      links: true,
      comments: true,
      signatures: true,
    });
    await expect(
      gedFeatures(store({ comments: false, signatures: false })),
    ).resolves.toEqual({ links: true, comments: false, signatures: false });
  });

  it("answers 404 for a disabled module", async () => {
    const settings = store({ links: false });
    await expect(requireGedFeature(settings, "links")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      requireGedFeature(settings, "comments"),
    ).resolves.toBeUndefined();
  });
});
