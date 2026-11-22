import type { MetadataRoute } from "next";

function normalizeWhoSlug(whoSlug?: string | null): string | null {
  if (!whoSlug) {
    return null;
  }
  const trimmed = whoSlug.trim();
  if (!trimmed || trimmed.length > 64) {
    return null;
  }
  return trimmed;
}

export function buildHouseholdManifestUrl(
  token: string,
  whoSlug?: string | null,
): string {
  const basePath = `/h/${encodeURIComponent(token)}/manifest`;
  const cleanWho = normalizeWhoSlug(whoSlug);
  if (!cleanWho) {
    return basePath;
  }
  return `${basePath}?who=${encodeURIComponent(cleanWho)}`;
}

export function buildHouseholdManifest(
  token: string,
  whoSlug?: string | null,
): MetadataRoute.Manifest {
  const householdPath = `/h/${encodeURIComponent(token)}`;
  const cleanWho = normalizeWhoSlug(whoSlug);
  const startUrl = cleanWho
    ? `${householdPath}?who=${encodeURIComponent(cleanWho)}`
    : householdPath;

  return {
    id: householdPath,
    name: "Maki Care",
    short_name: "Maki Care",
    description:
      "Warm daily care board for Maki's meals, litter, supplies, and play.",
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#FAF7F2",
    theme_color: "#1F6E4A",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
