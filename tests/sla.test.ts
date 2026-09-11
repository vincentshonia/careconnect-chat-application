import { describe, expect, it } from "vitest";
import { DEFAULT_SLA_MINUTES, isBreached, waitingMinutes } from "@/lib/sla";

const now = Date.parse("2026-09-10T12:00:00Z");

describe("waiting time for a first human reply", () => {
  it("measures from when a person was first asked for", () => {
    expect(
      waitingMinutes(
        {
          first_human_requested_at: "2026-09-10T11:40:00Z",
          requested_agent_at: "2026-09-10T11:50:00Z",
        },
        now,
      ),
    ).toBe(20);
  });

  it("falls back to the later request time when the first is missing", () => {
    expect(
      waitingMinutes(
        { first_human_requested_at: null, requested_agent_at: "2026-09-10T11:30:00Z" },
        now,
      ),
    ).toBe(30);
  });

  it("ignores chats where nobody ever asked for a person", () => {
    expect(
      waitingMinutes({ first_human_requested_at: null, requested_agent_at: null }, now),
    ).toBeNull();
    expect(isBreached({ requested_agent_at: null }, 15, now)).toBe(false);
  });

  it("compares against the organization's own target", () => {
    const row = { requested_agent_at: "2026-09-10T11:40:00Z" };
    expect(isBreached(row, 15, now)).toBe(true);
    expect(isBreached(row, 30, now)).toBe(false);
  });

  it("keeps 15 minutes as the fallback target", () => {
    expect(DEFAULT_SLA_MINUTES).toBe(15);
  });
});
