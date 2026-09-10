import { describe, expect, it } from "vitest";
import {
  isConversationEnded,
  nextPollDelay,
  POLL_MAX_MS,
  POLL_MIN_MS,
  POLL_QUIET_MS,
  safeStorage,
  shouldShowRating,
} from "@/lib/widget-client";

describe("isConversationEnded", () => {
  it("treats resolved, closed and abandoned as finished", () => {
    for (const s of ["resolved", "closed", "abandoned"]) expect(isConversationEnded(s)).toBe(true);
  });
  it("treats live statuses and missing values as ongoing", () => {
    for (const s of ["new", "waiting", "assigned", "active", null, undefined]) {
      expect(isConversationEnded(s)).toBe(false);
    }
  });
});

describe("nextPollDelay", () => {
  it("stays fast while the chat is active", () => {
    expect(nextPollDelay(POLL_MIN_MS, 1_000)).toBe(POLL_MIN_MS);
    expect(nextPollDelay(POLL_MAX_MS, 1_000)).toBe(POLL_MIN_MS);
  });
  it("backs off after a quiet stretch and stops at the ceiling", () => {
    let d = nextPollDelay(POLL_MIN_MS, POLL_QUIET_MS + 1);
    expect(d).toBe(10_000);
    d = nextPollDelay(d, POLL_QUIET_MS + 1);
    expect(d).toBe(20_000);
    d = nextPollDelay(d, POLL_QUIET_MS + 1);
    expect(d).toBe(POLL_MAX_MS);
    expect(nextPollDelay(d, POLL_QUIET_MS + 1)).toBe(POLL_MAX_MS);
  });
});

describe("shouldShowRating", () => {
  const base = {
    conversationId: "c1",
    status: "active" as string | null,
    agentReplied: false,
    dismissed: false,
    sending: false,
  };
  it("stays hidden while only the assistant has answered", () => {
    expect(shouldShowRating(base)).toBe(false);
  });
  it("shows once a person replied", () => {
    expect(shouldShowRating({ ...base, agentReplied: true })).toBe(true);
  });
  it("shows when the conversation has ended", () => {
    expect(shouldShowRating({ ...base, status: "closed" })).toBe(true);
  });
  it("stays hidden when dismissed, sending, or without a conversation", () => {
    expect(shouldShowRating({ ...base, agentReplied: true, dismissed: true })).toBe(false);
    expect(shouldShowRating({ ...base, agentReplied: true, sending: true })).toBe(false);
    expect(shouldShowRating({ ...base, agentReplied: true, conversationId: null })).toBe(false);
  });
});

describe("safeStorage", () => {
  it("round-trips values and JSON", () => {
    safeStorage.set("k", "v");
    expect(safeStorage.get("k")).toBe("v");
    safeStorage.setJson("j", { a: 1 });
    expect(safeStorage.getJson<{ a: number }>("j")).toEqual({ a: 1 });
    safeStorage.remove("k");
    expect(safeStorage.get("k")).toBeNull();
  });

  it("never throws when storage is blocked (Safari private mode)", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    expect(() => safeStorage.set("k", "v")).not.toThrow();
    expect(safeStorage.get("k")).toBeNull();
    expect(safeStorage.getJson("k")).toBeNull();
    expect(() => safeStorage.remove("k")).not.toThrow();
    if (original) Object.defineProperty(globalThis, "localStorage", original);
  });

  it("returns null for corrupt JSON instead of throwing", () => {
    safeStorage.set("bad", "{not json");
    expect(safeStorage.getJson("bad")).toBeNull();
  });
});
