import { describe, expect, it, vi } from "vitest";
import { conversationForSessionOrNew } from "@/lib/public-chat.server";
import { PublicChatError } from "@/lib/public-chat-error";
import { isStoredThreadFresh, THREAD_MAX_AGE_MS } from "@/lib/widget-client";

const ctx = { visitor: { id: "v1" }, claims: { org: "o1" } } as never;
const website = { id: "w1", organization_id: "o1" };

describe("conversationForSessionOrNew", () => {
  it("returns the existing conversation when the id is still valid", async () => {
    const create = vi.fn();
    const result = await conversationForSessionOrNew(ctx, website, "c1", undefined, {
      lookup: async () => ({ id: "c1" }),
      create,
    });
    expect(result).toEqual({ id: "c1" });
    expect(create).not.toHaveBeenCalled();
  });

  it("starts a fresh conversation when the stored id no longer exists", async () => {
    const result = await conversationForSessionOrNew(ctx, website, "gone", undefined, {
      lookup: async () => {
        throw new PublicChatError(404, "Conversation not found");
      },
      create: async () => ({ id: "new" }),
    });
    expect(result).toEqual({ id: "new" });
  });

  it("recovers from a malformed stored id too", async () => {
    const result = await conversationForSessionOrNew(ctx, website, "not-a-uuid", undefined, {
      lookup: async () => {
        throw new PublicChatError(400, "Invalid conversation id");
      },
      create: async () => ({ id: "new" }),
    });
    expect(result).toEqual({ id: "new" });
  });

  it("still surfaces genuine server failures", async () => {
    await expect(
      conversationForSessionOrNew(ctx, website, "c1", undefined, {
        lookup: async () => {
          throw new PublicChatError(500, "Database unavailable");
        },
        create: async () => ({ id: "new" }),
      }),
    ).rejects.toThrow("Database unavailable");
  });

  it("creates one directly when no id is stored", async () => {
    const lookup = vi.fn();
    const result = await conversationForSessionOrNew(ctx, website, null, "Referral enquiry", {
      lookup,
      create: async (_site, _visitor, subject) => ({ id: "new", subject }),
    });
    expect(result).toEqual({ id: "new", subject: "Referral enquiry" });
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("isStoredThreadFresh", () => {
  const now = 1_700_000_000_000;
  it("keeps a recent conversation", () => {
    expect(isStoredThreadFresh(now - 60_000, now)).toBe(true);
  });
  it("drops one older than seven days", () => {
    expect(isStoredThreadFresh(now - THREAD_MAX_AGE_MS - 1, now)).toBe(false);
  });
  it("drops one with no timestamp", () => {
    expect(isStoredThreadFresh(undefined, now)).toBe(false);
  });
});
