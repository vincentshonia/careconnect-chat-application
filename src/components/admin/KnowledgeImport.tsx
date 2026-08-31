import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { importKnowledgeSourceFn } from "@/lib/knowledge-import.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACCEPT = ".pdf,.docx,.txt,.md,.csv,.html,.htm";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function KnowledgeImport({ mode }: { mode: "articles" | "faqs" }) {
  const queryClient = useQueryClient();
  const importSource = useServerFn(importKnowledgeSourceFn);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [publish, setPublish] = useState(mode === "faqs");
  const [notice, setNotice] = useState<string | null>(null);

  const label = mode === "articles" ? "articles" : "FAQs";

  const run = useMutation({
    mutationFn: async () => {
      const status = publish ? ("published" as const) : ("draft" as const);
      if (file) {
        const dataBase64 = await fileToBase64(file);
        return importSource({
          data: {
            mode,
            status,
            source: {
              kind: "file",
              filename: file.name,
              mimeType: file.type || "",
              dataBase64,
            },
          },
        });
      }
      if (!url.trim()) throw new Error("Choose a document or paste a link first.");
      return importSource({ data: { mode, status, source: { kind: "url", url: url.trim() } } });
    },
    onSuccess: async (result) => {
      setNotice(
        `Created ${result.created} ${label} from ${result.sourceLabel}` +
          (result.indexed ? ` and indexed ${result.indexed} chunks.` : "."),
      );
      setUrl("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await queryClient.invalidateQueries({
        queryKey: [mode === "articles" ? "kb-articles" : "kb-faqs"],
      });
    },
    onError: (err) => setNotice(err instanceof Error ? err.message : "Import failed"),
  });

  return (
    <form
      className="space-y-3 rounded-xl border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setNotice(null);
        run.mutate();
      }}
    >
      <div>
        <h2 className="text-sm font-semibold">Import {label} from a document or link</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload a PDF, Word (.docx), text, markdown, CSV or HTML file — or paste a public link to a
          page or PDF. The content is split into separate topic areas automatically.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`kb-file-${mode}`}>Document</Label>
        <Input
          id={`kb-file-${mode}`}
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          onChange={(e) => {
            setNotice(null);
            setFile(e.target.files?.[0] ?? null);
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`kb-url-${mode}`}>Or a web link</Label>
        <Input
          id={`kb-url-${mode}`}
          type="url"
          placeholder="https://example.org/eligibility.pdf"
          value={url}
          disabled={!!file}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[hsl(var(--primary))]"
          checked={publish}
          onChange={(e) => setPublish(e.target.checked)}
        />
        {mode === "articles"
          ? "Publish and index immediately (otherwise saved as drafts)"
          : "Activate immediately in the widget"}
      </label>

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <Button type="submit" disabled={run.isPending}>
        {run.isPending ? `Reading & creating ${label}…` : `Import ${label}`}
      </Button>
    </form>
  );
}
