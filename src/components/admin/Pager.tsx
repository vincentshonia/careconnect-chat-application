import { Button } from "@/components/ui/button";

/**
 * Shared pagination footer. Every long list in the console pages through the
 * database rather than loading everything into the browser, so the same
 * "showing X–Y of N" control appears throughout.
 */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  noun = "records",
  busy,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  noun?: string;
  busy?: boolean;
}) {
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, total);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        {total === 0 ? `No ${noun}` : `${first}–${last} of ${total.toLocaleString()} ${noun}`}
        {pages > 1 ? ` · page ${page + 1} of ${pages}` : ""}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0 || busy} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={(page + 1) * pageSize >= total || busy}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
