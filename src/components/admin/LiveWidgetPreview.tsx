import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { widgetPreviewProofFn } from "@/lib/widget-preview.functions";
import { Button } from "@/components/ui/button";

/**
 * The real chat widget, running inside the admin console.
 *
 * It loads the same `/widget` page a visitor gets, authorised by a short-lived
 * staff-issued proof instead of the embedding allow-list. Everything a visitor
 * can do works here — AI answers, escalation, forms — but the conversation is
 * flagged as preview traffic, so it stays out of the waiting queue, the
 * dashboard and every report.
 */
export function LiveWidgetPreview({
  websiteId,
  onClose,
}: {
  websiteId: string;
  onClose: () => void;
}) {
  const mintProof = useServerFn(widgetPreviewProofFn);
  const proofQuery = useQuery({
    queryKey: ["widget-preview-proof", websiteId],
    // The proof lives 15 minutes; refresh comfortably inside that window.
    refetchInterval: 10 * 60_000,
    staleTime: 10 * 60_000,
    queryFn: () => mintProof({ data: { websiteId } }),
  });

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const proof = proofQuery.data?.proof ?? null;
  const src = proof
    ? `/widget?w=${encodeURIComponent(websiteId)}&h=${encodeURIComponent(origin)}&op=${encodeURIComponent(proof)}`
    : null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-[400px] flex-col gap-2">
      <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 shadow-lg">
        <p className="text-xs text-muted-foreground">
          Test chat — not counted in the queue or reports
        </p>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="h-[620px] overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        {proofQuery.isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              The test chat couldn't start. Please try again.
            </p>
            <Button size="sm" variant="outline" onClick={() => proofQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : src ? (
          <iframe
            key={src}
            title="Chat widget test"
            src={src}
            className="h-full w-full border-0"
            allow="clipboard-write"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Starting test chat…
          </div>
        )}
      </div>
    </div>
  );
}
