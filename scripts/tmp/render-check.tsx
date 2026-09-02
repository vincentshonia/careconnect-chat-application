import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { FIGURES } from "../../src/components/training/figures";
import { BlockView } from "../../src/components/training/GuideBlocks";
import { GUIDES, GUIDE_ORDER } from "../../src/lib/training/registry";
import { FIGURE_IDS } from "../../src/lib/training/types";

let figCount = 0;
for (const id of FIGURE_IDS) {
  const Fig = (FIGURES as any)[id];
  if (!Fig) throw new Error("missing figure " + id);
  const html = renderToStaticMarkup(React.createElement(Fig));
  if (html.length < 50) throw new Error("empty figure " + id);
  figCount++;
}

let blockCount = 0;
for (const role of GUIDE_ORDER) {
  for (const ch of GUIDES[role].chapters)
    for (const s of ch.sections)
      for (const b of s.blocks) {
        renderToStaticMarkup(React.createElement(BlockView, { block: b } as any));
        blockCount++;
      }
}
console.log("figures rendered:", figCount, "blocks rendered:", blockCount);
