import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pushStatus, requestPush, type PushStatus } from "@/lib/desktop-push";

const DISMISS_KEY = "careconnect.desktop-alerts.dismissed";

/**
 * Slim prompt above the page asking staff to allow desktop alerts, so a chat
 * landing in the queue reaches them even when the tab is in the background.
 * Shows only when the browser can still be asked (or the app is in the preview
 * iframe, where the browser refuses the prompt), and can be dismissed.
 */
export function DesktopAlertBar() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setStatus(pushStatus());
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed || !status) return null;
  if (status === "granted" || status === "unsupported") return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private browsing — the bar simply returns next load */
    }
  };

  const message =
    status === "open-in-new-tab"
      ? "Open CareConnect in its own browser tab to turn on desktop alerts for new chats."
      : status === "denied"
        ? "Desktop alerts are blocked. Allow notifications for this site in your browser settings to hear new chats."
        : "Turn on desktop alerts so you are notified the moment a visitor is waiting.";

  return (
    <div className="border-b border-border bg-muted/60 px-5 py-2 sm:px-8 print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <Bell className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{message}</p>
        {status === "default" && (
          <Button size="sm" onClick={async () => setStatus(await requestPush())}>
            Enable alerts
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Dismiss alert prompt">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
