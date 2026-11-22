import { describe, expect, it } from "vitest";
import {
  buildHouseholdManifest,
  buildHouseholdManifestUrl,
} from "@/lib/pwa-manifest";

describe("PWA household manifest builder", () => {
  it("builds a household manifest URL without who slug", () => {
    expect(buildHouseholdManifestUrl("abc-123")).toBe("/h/abc-123/manifest");
    expect(buildHouseholdManifestUrl("abc-123", "   ")).toBe(
      "/h/abc-123/manifest",
    );
  });

  it("builds a household manifest URL with who slug", () => {
    expect(buildHouseholdManifestUrl("abc-123", "ate")).toBe(
      "/h/abc-123/manifest?who=ate",
    );
  });

  it("sets start_url to the household route and includes iOS + Android PNG icons", () => {
    const manifest = buildHouseholdManifest("abc-123", "jed");

    expect(manifest.id).toBe("/h/abc-123");
    expect(manifest.start_url).toBe("/h/abc-123?who=jed");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
        }),
        expect.objectContaining({
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
        }),
      ]),
    );
  });

  it("falls back to bare household start_url when who is omitted", () => {
    const manifest = buildHouseholdManifest("abc-123");
    expect(manifest.start_url).toBe("/h/abc-123");
  });
});
