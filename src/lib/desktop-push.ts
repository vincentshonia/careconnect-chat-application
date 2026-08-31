/**
 * Desktop / device notifications for staff.
 *
 * Uses the browser Notification API. Browsers refuse permission prompts inside
 * a cross-origin iframe (the Lovable preview), so that case is reported back
 * instead of thrown — the console tells the user to open the app in its own tab.
 */
export type PushStatus = "unsupported" | "open-in-new-tab" | "granted" | "denied" | "default";

export function pushStatus(): PushStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (window.top !== window.self) return "open-in-new-tab";
  return Notification.permission as PushStatus;
}

export async function requestPush(): Promise<PushStatus> {
  const status = pushStatus();
  if (status !== "default") return status;
  try {
    return (await Notification.requestPermission()) as PushStatus;
  } catch {
    return "denied";
  }
}

/** Best-effort desktop notification; silently no-ops when not permitted. */
export function showDesktopNotification(title: string, body?: string | null, link?: string | null) {
  try {
    if (pushStatus() !== "granted") return;
    const n = new Notification(title, {
      body: body ?? undefined,
      icon: "/favicon.png",
      tag: link ?? undefined,
    });
    n.onclick = () => {
      window.focus();
      if (link) window.location.assign(link);
      n.close();
    };
  } catch {
    /* never break the in-app alert */
  }
}
