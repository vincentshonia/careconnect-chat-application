import { describe, expect, it } from "vitest";
import { mergeOrgLimits } from "@/lib/public-chat.server";

const DEFAULTS = {
  monthly_ai_messages: 5000,
  monthly_ai_tokens: 5_000_000,
  session_ai_messages_per_minute: 15,
  ip_requests_per_minute: 60,
  max_prompt_chars: 2000,
  hard_stop: true,
};

describe("mergeOrgLimits", () => {
  it("returns the defaults when no row exists", () => {
    expect(mergeOrgLimits(null)).toEqual(DEFAULTS);
  });

  it("ignores null columns instead of disabling a limit", () => {
    const merged = mergeOrgLimits({
      monthly_ai_messages: null,
      max_prompt_chars: null,
      hard_stop: null,
    });
    expect(merged).toEqual(DEFAULTS);
  });

  it("keeps configured values, including a deliberate zero and hard_stop false", () => {
    const merged = mergeOrgLimits({
      monthly_ai_messages: 100,
      ip_requests_per_minute: 0,
      hard_stop: false,
      session_ai_messages_per_minute: null,
    });
    expect(merged.monthly_ai_messages).toBe(100);
    expect(merged.ip_requests_per_minute).toBe(0);
    expect(merged.hard_stop).toBe(false);
    expect(merged.session_ai_messages_per_minute).toBe(15);
  });

  it("ignores unusable values and extra columns", () => {
    const merged = mergeOrgLimits({
      max_prompt_chars: "not a number",
      hard_stop: "yes",
      organization_id: "abc",
    } as Record<string, unknown>);
    expect(merged.max_prompt_chars).toBe(2000);
    expect(merged.hard_stop).toBe(true);
    expect(merged).toEqual(DEFAULTS);
  });
});
