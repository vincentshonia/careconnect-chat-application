import { describe, expect, it } from "vitest";

import {
  isOutboundSender,
  threadBubbleClass,
  threadMetaClass,
  threadRowClass,
} from "@/lib/thread-layout";

describe("conversation thread alignment", () => {
  it("puts a live agent's reply on the right, avatar included", () => {
    const row = threadRowClass("agent");
    expect(row).toContain("flex-row-reverse");
    expect(threadMetaClass("agent")).toContain("justify-end");
    expect(threadBubbleClass("agent")).toContain("bg-primary/10");
  });

  it("puts the assistant's answer on the right as well", () => {
    expect(isOutboundSender("ai")).toBe(true);
    expect(threadRowClass("ai")).toContain("flex-row-reverse");
  });

  it("keeps the visitor on the left with a neutral bubble", () => {
    const row = threadRowClass("visitor");
    expect(row).not.toContain("flex-row-reverse");
    expect(threadMetaClass("visitor")).not.toContain("justify-end");
    expect(threadBubbleClass("visitor")).toContain("bg-muted/70");
  });

  it("caps every bubble so it never spans the pane", () => {
    expect(threadBubbleClass("agent")).toContain("max-w-[72%]");
    expect(threadBubbleClass("visitor")).toContain("max-w-[72%]");
  });
});
