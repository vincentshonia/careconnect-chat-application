/**
 * Renders a typed guide into a plain-Markdown staff manual.
 *
 * The Training Center is the primary experience, but onboarding also needs a
 * hand-outable document (email, print, intranet). Generating that document from
 * the same typed content means the written manual can never drift away from
 * what the console actually shows.
 */
import { FIGURE_SUMMARIES } from "./figure-summaries";
import type { Block, Guide } from "./types";
import { formatReviewDate, TRAINING_APP_BUILD, TRAINING_GUIDE_VERSION } from "./version";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function renderBlock(block: Block): string[] {
  switch (block.kind) {
    case "lead":
      return [`**${block.text}**`];

    case "p":
      return [block.text];

    case "steps": {
      const lines = block.title ? [`**${block.title}**`, ""] : [];
      block.items.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
      return lines;
    }

    case "bullets": {
      const lines = block.title ? [`**${block.title}**`, ""] : [];
      block.items.forEach((item) => lines.push(`- ${item}`));
      return lines;
    }

    case "figure": {
      const summary = FIGURE_SUMMARIES[block.figure];
      const lines = [`> **Interface illustration — ${block.caption ?? summary.title}**`, ">"];
      lines.push(`> ${summary.description}`);
      if (summary.markers.length) {
        lines.push(">");
        summary.markers.forEach((marker, index) => lines.push(`> ${index + 1}. ${marker}`));
      }
      return lines;
    }

    case "callout": {
      const label =
        block.tone === "warning"
          ? "Warning"
          : block.tone === "privacy"
            ? "Privacy"
            : block.tone === "tip"
              ? "Tip"
              : "Note";
      return [`> **${label} — ${block.title}**`, ">", `> ${block.text}`];
    }

    case "doDont": {
      const lines = ["**Do**", ""];
      block.dos.forEach((item) => lines.push(`- ${item}`));
      lines.push("", "**Don't**", "");
      block.donts.forEach((item) => lines.push(`- ${item}`));
      return lines;
    }

    case "table": {
      const lines = block.caption ? [`*${block.caption}*`, ""] : [];
      lines.push(`| ${block.head.map(escapeCell).join(" | ")} |`);
      lines.push(`| ${block.head.map(() => "---").join(" | ")} |`);
      block.rows.forEach((row) => lines.push(`| ${row.map(escapeCell).join(" | ")} |`));
      return lines;
    }

    case "faq":
      return block.items.flatMap((item) => [`**${item.q}**`, "", item.a, ""]);

    case "checklist": {
      const lines = block.title ? [`**${block.title}**`, ""] : [];
      block.items.forEach((item) => lines.push(`- [ ] ${item}`));
      return lines;
    }

    case "terms":
      return block.items.map((item) => `- **${item.term}** — ${item.definition}`);

    case "quiz": {
      const lines: string[] = [];
      block.items.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.question}`, "");
        item.options.forEach((option, oIndex) =>
          lines.push(`   ${String.fromCharCode(65 + oIndex)}. ${option}`),
        );
        lines.push("", `   *Answer: ${String.fromCharCode(65 + item.answer)} — ${item.why}*`, "");
      });
      return lines;
    }

    default:
      return [];
  }
}

/** Full Markdown manual for one guide. */
export function guideToMarkdown(guide: Guide): string {
  const out: string[] = [];
  out.push(`# CareConnect staff manual — ${guide.label}`, "");
  out.push(`_${guide.tagline}_`, "");
  out.push(`**Who this is for:** ${guide.audience}`, "");
  out.push(`**Reading time:** ${guide.duration}`, "");
  out.push(
    `**Guide version ${TRAINING_GUIDE_VERSION} · Last reviewed ${formatReviewDate()} · App build ${TRAINING_APP_BUILD}**`,
    "",
  );
  out.push(
    "Illustrations in this manual are drawings of the console, not photographs of it, and every name or number in them is invented.",
    "",
  );

  out.push("## Contents", "");
  guide.chapters.forEach((chapter, index) => {
    out.push(`${index + 1}. ${chapter.title}`);
  });
  out.push("");

  guide.chapters.forEach((chapter, index) => {
    out.push("---", "", `## ${index + 1}. ${chapter.title}`, "");
    if (chapter.intro) out.push(chapter.intro, "");
    chapter.sections.forEach((section, sIndex) => {
      out.push(`### ${index + 1}.${sIndex + 1} ${section.title}`, "");
      if (section.summary) out.push(`_${section.summary}_`, "");
      section.blocks.forEach((block) => {
        const lines = renderBlock(block);
        if (lines.length) out.push(...lines, "");
      });
    });
  });

  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
