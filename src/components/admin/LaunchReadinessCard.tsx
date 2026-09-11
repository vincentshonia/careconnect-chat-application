import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { launchReadinessFn } from "@/lib/launch-readiness.functions";

/** Shared cache key so the Websites tab reuses the same result. */
export const LAUNCH_READINESS_KEY = ["launch-readiness"] as const;

export function useLaunchReadiness(enabled: boolean) {
  const run = useServerFn(launchReadinessFn);
  return useQuery({
    queryKey: LAUNCH_READINESS_KEY,
    enabled,
    // The assistant check really asks three questions, so don't re-run it on
    // every tab change — the operator refreshes it deliberately.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: () => run({}),
  });
}

/** Go-live checklist shown at the top of the organization settings tab. */
export function LaunchReadinessCard() {
  const readiness = useLaunchReadiness(true);
  const data = readiness.data;

  return (
    <section
      id="launch-readiness"
      className="mb-6 rounded-xl border border-border bg-card p-4"
      aria-labelledby="launch-readiness-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="launch-readiness-heading" className="text-sm font-semibold">
            Launch readiness
          </h2>
          <p className="text-xs text-muted-foreground">
            Everything that must be true before the chat goes live on your website. Checked live,
            each time you run it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data ? (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                data.overall === "PASS"
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {data.overall === "PASS"
                ? "Ready to launch"
                : `${data.criticalFailures} item(s) to fix`}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={readiness.isFetching}
            onClick={() => void readiness.refetch()}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${readiness.isFetching ? "animate-spin" : ""}`} />
            {readiness.isFetching ? "Checking…" : "Run checks"}
          </Button>
        </div>
      </div>

      {readiness.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Running the checks…</p>
      ) : null}

      {readiness.isError ? (
        <p className="mt-3 text-sm text-destructive">
          The checks could not be completed:{" "}
          {readiness.error instanceof Error ? readiness.error.message : "unknown problem"}
        </p>
      ) : null}

      {data ? (
        <ul className="mt-3 space-y-2">
          {data.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-sm">
              {check.pass ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              )}
              <span>
                <span className="font-medium">{check.label}</span>
                <span className="sr-only">: {check.pass ? "passed" : "failed"}</span>{" "}
                <span className="text-muted-foreground">— {check.reason}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {data ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Build {data.buildId.slice(0, 12)} · checked {new Date(data.generatedAt).toLocaleString()}
        </p>
      ) : null}
    </section>
  );
}
