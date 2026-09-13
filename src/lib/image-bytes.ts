/**
 * Tiny image sniffing used by the profile-photo upload. We only accept PNG and
 * JPEG, and we decide from the bytes themselves — a renamed `.png` that is
 * really something else is rejected.
 */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export type SniffedImage = { type: "image/png" | "image/jpeg"; ext: "png" | "jpg" } | null;

export function sniffImage(bytes: Uint8Array): SniffedImage {
  if (bytes.length < 12) return null;
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => bytes[i] === b)) return { type: "image/png", ext: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { type: "image/jpeg", ext: "jpg" };
  }
  return null;
}

/** Object path stored on `profiles.avatar_url`, tolerating the legacy proxy URL. */
export function avatarObjectPath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const prefix = "/api/public/staff-avatar/";
  const path = stored.startsWith(prefix) ? stored.slice(prefix.length) : stored;
  if (!path || path.includes("..") || /^https?:\/\//i.test(path)) return null;
  return path;
}

/** Visitor-facing URL for a stored avatar, whichever form the column holds. */
export function avatarPublicUrl(stored: string | null | undefined): string | null {
  const path = avatarObjectPath(stored);
  return path ? `/api/public/staff-avatar/${path}` : null;
}

/** "Ada Lovelace" -> "AL". Used for the tinted-circle fallback. */
export function initialsOf(name: string | null | undefined): string {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
