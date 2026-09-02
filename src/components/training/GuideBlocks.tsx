/**
 * Renders a training block. Every block type is presentational and prints
 * cleanly: the same markup serves the on-screen reader and the paper handout.
 */
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleHelp,
  Info,
  Lightbulb,
  Lock,
  Minus,
  X,
} from "lucide-react";
import type { Block, QuizItem } from "@/lib/training/types";
import { FIGURES } from "./figures";
import { Button } from "@/components/ui/button";

const CALLOUT_STYLES = {
  note: {
    icon: Info,
    wrap: "border-primary/25 bg-primary/5",
    chip: "bg-primary/12 text-primary",
  },
  tip: {
    icon: Lightbulb,
    wrap: "border-success/30 bg-success/5",
    chip: "bg-success/12 text-success",
  },
  warning: {
    icon: AlertTriangle,
    wrap: "border-warning/35 bg-warning/8",
    chip: "bg-warning/15 text-warning",
  },
  privacy: {
    icon: Lock,
    wrap: "border-accent/35 bg-accent/8",
    chip: "bg-accent/15 text-accent-foreground",
  },
} as const;

function FigureBlock({ figure, caption }: { figure: keyof typeof FIGURES; caption?: string }) {
  const spec = FIGURES[figure];
  if (!spec) return null;
  return (
    <figure className="my-5 break-inside-avoid space-y-3">
      <div role="img" aria-label={spec.alt}>
        {spec.render()}
      </div>
      <figcaption className="space-y-2">
        <p className="text-sm font-semibold text-foreground">{caption ?? spec.title}</p>
        {spec.markers.length ? (
          <ol className="space-y-1.5">
            {spec.markers.map((marker, index) => (
              <li key={marker} className="flex gap-2 text-sm text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="gradient-brand mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold leading-none text-sidebar-primary-foreground"
                >
                  {index + 1}
                </span>
                <span>{marker}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </figcaption>
    </figure>
  );
}

function Checklist({ title, items }: { title?: string; items: string[] }) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  return (
    <div className="my-4 break-inside-avoid rounded-xl border border-border bg-muted/30 p-4">
      {title ? <p className="mb-3 text-sm font-semibold text-foreground">{title}</p> : null}
      <ul className="space-y-2">
        {items.map((item, index) => {
          const on = ticked.has(index);
          return (
            <li key={item}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setTicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(index)) next.delete(index);
                    else next.add(index);
                    return next;
                  })
                }
                className="flex w-full items-start gap-3 rounded-lg px-1.5 py-1 text-left text-sm transition-colors hover:bg-background/70"
              >
                <span
                  className={`mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-md border transition-colors ${
                    on
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border bg-background"
                  }`}
                  style={{ height: "1.125rem", width: "1.125rem" }}
                >
                  {on ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                </span>
                <span className={on ? "text-muted-foreground line-through" : "text-foreground"}>
                  {item}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Quiz({ items }: { items: QuizItem[] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const answered = Object.keys(answers).length;
  const correct = items.filter((item, index) => answers[index] === item.answer).length;

  return (
    <div className="my-4 space-y-4">
      {items.map((item, qIndex) => {
        const chosen = answers[qIndex];
        const isAnswered = chosen !== undefined;
        return (
          <div
            key={item.question}
            className="break-inside-avoid rounded-xl border border-border bg-card p-4"
          >
            <p className="flex gap-2 text-sm font-semibold text-foreground">
              <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{item.question}</span>
            </p>
            <div className="mt-3 grid gap-2">
              {item.options.map((option, oIndex) => {
                const isChosen = chosen === oIndex;
                const isRight = oIndex === item.answer;
                const state = !isAnswered
                  ? "border-border bg-background hover:border-primary/40 hover:bg-primary/5"
                  : isRight
                    ? "border-success/50 bg-success/10 text-foreground"
                    : isChosen
                      ? "border-destructive/50 bg-destructive/10 text-foreground"
                      : "border-border bg-background text-muted-foreground";
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={isAnswered}
                    onClick={() => setAnswers((prev) => ({ ...prev, [qIndex]: oIndex }))}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${state}`}
                  >
                    <span aria-hidden="true" className="mt-0.5">
                      {isAnswered ? (
                        isRight ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : isChosen ? (
                          <X className="h-4 w-4 text-destructive" />
                        ) : (
                          <Minus className="h-4 w-4 opacity-40" />
                        )
                      ) : (
                        <span className="grid h-4 w-4 place-items-center rounded-full border border-border text-[10px] font-semibold">
                          {String.fromCharCode(65 + oIndex)}
                        </span>
                      )}
                    </span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
            {isAnswered ? (
              <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {item.why}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">
          {answered
            ? `${correct} of ${answered} correct`
            : "Answer each question to see how you did."}
        </p>
        {answered ? (
          <Button variant="ghost" size="sm" onClick={() => setAnswers({})}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "lead":
      return <p className="my-3 text-base font-medium leading-relaxed text-foreground">{block.text}</p>;

    case "p":
      return <p className="my-3 text-sm leading-relaxed text-muted-foreground">{block.text}</p>;

    case "steps":
      return (
        <div className="my-4 break-inside-avoid">
          {block.title ? (
            <p className="mb-2 text-sm font-semibold text-foreground">{block.title}</p>
          ) : null}
          <ol className="space-y-2.5">
            {block.items.map((item, index) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
      );

    case "bullets":
      return (
        <div className="my-4 break-inside-avoid">
          {block.title ? (
            <p className="mb-2 text-sm font-semibold text-foreground">{block.title}</p>
          ) : null}
          <ul className="space-y-1.5">
            {block.items.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="mt-[0.5rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case "figure":
      return <FigureBlock figure={block.figure} caption={block.caption} />;

    case "callout": {
      const style = CALLOUT_STYLES[block.tone];
      const Icon = style.icon;
      return (
        <div className={`my-4 break-inside-avoid rounded-xl border p-4 ${style.wrap}`}>
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className={`grid h-6 w-6 place-items-center rounded-lg ${style.chip}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            {block.title}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{block.text}</p>
        </div>
      );
    }

    case "doDont":
      return (
        <div className="my-4 grid gap-3 break-inside-avoid sm:grid-cols-2">
          <div className="rounded-xl border border-success/30 bg-success/5 p-4">
            <p className="mb-2 text-sm font-semibold text-success">Do</p>
            <ul className="space-y-2">
              {block.dos.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="mb-2 text-sm font-semibold text-destructive">Don't</p>
            <ul className="space-y-2">
              {block.donts.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      );

    case "table":
      return (
        <figure className="my-4 break-inside-avoid overflow-hidden rounded-xl border border-border">
          {block.caption ? (
            <figcaption className="border-b border-border bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {block.caption}
            </figcaption>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-muted/30">
                <tr>
                  {block.head.map((cell) => (
                    <th
                      key={cell}
                      scope="col"
                      className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row) => (
                  <tr key={row.join("|")} className="border-t border-border/70 align-top">
                    {row.map((cell, index) => (
                      <td
                        key={cell + index}
                        className={`px-4 py-2.5 ${
                          index === 0 ? "font-medium text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      );

    case "faq":
      return (
        <dl className="my-4 space-y-3">
          {block.items.map((item) => (
            <div
              key={item.q}
              className="break-inside-avoid rounded-xl border border-border bg-card p-4"
            >
              <dt className="text-sm font-semibold text-foreground">{item.q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.a}</dd>
            </div>
          ))}
        </dl>
      );

    case "checklist":
      return <Checklist title={block.title} items={block.items} />;

    case "terms":
      return (
        <dl className="my-4 grid gap-3 sm:grid-cols-2">
          {block.items.map((item) => (
            <div
              key={item.term}
              className="break-inside-avoid rounded-xl border border-border bg-card p-3.5"
            >
              <dt className="text-sm font-semibold text-foreground">{item.term}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {item.definition}
              </dd>
            </div>
          ))}
        </dl>
      );

    case "quiz":
      return <Quiz items={block.items} />;

    default:
      return null;
  }
}
