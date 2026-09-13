import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { staffAvatarUrlFn } from "@/lib/staff-avatar.functions";
import { initialsOf } from "@/lib/image-bytes";
import { cn } from "@/lib/utils";

/** Signed photo URL for a colleague, cached well inside its one-hour life. */
export function useStaffAvatarUrl(userId: string | null | undefined) {
  const fetchUrl = useServerFn(staffAvatarUrlFn);
  return useQuery({
    queryKey: ["staff-avatar", userId],
    enabled: Boolean(userId),
    staleTime: 50 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
    queryFn: async () => (await fetchUrl({ data: { userId: userId! } })).url,
  });
}

/**
 * A staff photo for logged-in users, falling back to initials in a tinted
 * circle whenever there is no photo or the signed link fails to load.
 */
export function StaffAvatar({
  userId,
  name,
  className,
  imageUrl,
}: {
  userId: string | null | undefined;
  name?: string | null;
  className?: string;
  /** Skip the lookup when a URL is already at hand. */
  imageUrl?: string | null;
}) {
  const query = useStaffAvatarUrl(imageUrl ? null : userId);
  const [failed, setFailed] = useState(false);
  const url = imageUrl ?? query.data ?? null;
  const initials = initialsOf(name) || "—";

  return (
    <div
      className={cn(
        "grid place-items-center overflow-hidden rounded-full border border-border bg-primary/10 text-sm font-semibold text-primary",
        className,
      )}
    >
      {url && !failed ? (
        <img
          key={url}
          src={url}
          alt={name ? `${name}'s profile photo` : "Profile photo"}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </div>
  );
}
