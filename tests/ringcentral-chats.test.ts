import { describe, expect, it, vi } from "vitest";
import { listChats, mergeChats, type ListChatsDeps } from "@/lib/ringcentral.server";

const BOT_CHATS = [
  { id: "161247035398", name: "ME Website Chatbot" },
  { id: "140941180934", name: "Bulletin Board" },
];
const JWT_CHATS = [
  { id: "140941180934", name: "Bulletin Board" },
  { id: "138654793734", name: "ME Live Transfers" },
];

function deps(overrides: Partial<ListChatsDeps>): ListChatsDeps {
  return {
    bot: async () => null,
    forToken: async () => [],
    viaJwt: async () => null,
    ...overrides,
  };
}

describe("mergeChats", () => {
  it("de-dupes by id, keeps the first source, and sorts by name", () => {
    expect(mergeChats(BOT_CHATS, JWT_CHATS).map((c) => c.name)).toEqual([
      "Bulletin Board",
      "ME Live Transfers",
      "ME Website Chatbot",
    ]);
  });
});

describe("listChats identity precedence", () => {
  it("asks the bot identity first, because the bot is what posts", async () => {
    const forToken = vi.fn(async () => BOT_CHATS);
    const chats = await listChats(
      deps({ bot: async () => ({ token: "bot-token", name: "PHG Alert Bot" }), forToken }),
    );
    expect(forToken).toHaveBeenCalledWith("bot-token");
    expect(chats.map((c) => c.id)).toContain("161247035398");
  });

  it("falls back to the JWT user when no bot is configured", async () => {
    const forToken = vi.fn(async () => BOT_CHATS);
    const chats = await listChats(deps({ forToken, viaJwt: async () => JWT_CHATS }));
    expect(forToken).not.toHaveBeenCalled();
    expect(chats.map((c) => c.id).sort()).toEqual(["138654793734", "140941180934"]);
  });

  it("merges both identities without duplicates when both exist", async () => {
    const chats = await listChats(
      deps({
        bot: async () => ({ token: "bot-token", name: "PHG Alert Bot" }),
        forToken: async () => BOT_CHATS,
        viaJwt: async () => JWT_CHATS,
      }),
    );
    expect(chats).toHaveLength(3);
    expect(new Set(chats.map((c) => c.id)).size).toBe(3);
  });

  it("still returns the JWT chats when the bot lookup throws", async () => {
    const chats = await listChats(
      deps({
        bot: async () => {
          throw new Error("bot down");
        },
        viaJwt: async () => JWT_CHATS,
      }),
    );
    expect(chats).toHaveLength(2);
  });

  it("returns nothing when neither identity is available", async () => {
    expect(await listChats(deps({}))).toEqual([]);
  });
});
