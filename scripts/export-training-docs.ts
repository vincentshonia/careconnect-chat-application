/**
 * Regenerates the written staff manuals from the Training Center content.
 * Run with: bun scripts/export-training-docs.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { GUIDES, GUIDE_ORDER } from "../src/lib/training/registry";
import { guideToMarkdown } from "../src/lib/training/markdown";
import { formatReviewDate, TRAINING_APP_BUILD, TRAINING_GUIDE_VERSION } from "../src/lib/training/version";

const OUT = "docs/staff-manuals";
mkdirSync(OUT, { recursive: true });

const index: string[] = [
  "# CareConnect staff manuals",
  "",
  `**Guide version ${TRAINING_GUIDE_VERSION} · Last reviewed ${formatReviewDate()} · App build ${TRAINING_APP_BUILD}**`,
  "",
  "These manuals are generated from the in-app Training Center (Help & Training in the sidebar).",
  "Do not edit them by hand — change the guide content and run `bun scripts/export-training-docs.ts`.",
  "",
];

for (const role of GUIDE_ORDER) {
  const guide = GUIDES[role];
  const file = `${role.replace(/_/g, "-")}.md`;
  writeFileSync(`${OUT}/${file}`, guideToMarkdown(guide));
  index.push(`- [${guide.label}](./${file}) — ${guide.tagline} (${guide.duration})`);
}

index.push("");
writeFileSync(`${OUT}/README.md`, `${index.join("\n")}\n`);
console.log(`Wrote ${GUIDE_ORDER.length} manuals to ${OUT}`);
