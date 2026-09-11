import { Button } from "@/components/ui/button";

/**
 * A failed query must never look like "there is nothing here". This shows the
 * real reason and offers a retry, so staff can tell an empty queue apart from
 * a broken one.
 */
export function QueryError({
  error,
  onRetry,
  busy,
  className,
}: {
  error: unknown;
  onRetry: () => void;
  busy?: boolean;
  className?: string;
}) {
  const message =
    error instanceof Error && error.message ? error.message : "Something went wrong loading this.";
  return (
    <div
      role="alert"
      className={`rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm ${className ?? ""}`}
    >
      <p className="font-medium text-destructive">Could not load this list</p>
      <p className="mt-1 text-muted-foreground">{message}</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={onRetry} disabled={busy}>
        {busy ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}
