import { describe, expect, it } from "vitest";
import {
  CLOSED_STATUSES,
  EXCLUDED_STATUSES,
  isQueued,
  QUEUE_PREDICATE,
  QUEUE_STATUSES,
  waitLabel,
} from "@/lib/conversation-status";
import { decideReopen, REOPENABLE_STATUSES } from "@/lib/conversation-reopen";

describe("queue predicate", () => {
  it("describes exactly one rule", () => {
    expect(QUEUE_PREDICATE.escalationRequested).toBe(true);
    expect(QUEUE_PREDICATE.assignedTo).toBeNull();
    expect([...QUEUE_STATUSES]).toEqual(["waiting", "escalated", "follow_up"]);
    expect(QUEUE_PREDICATE.sql).toContain("escalation_requested");
  });

  it("keeps AI-handled chats out of the human queue", () => {
    expect(isQueued({ escalation_requested: false, assigned_to: null, status: "new" })).toBe(false);
    expect(isQueued({ escalation_requested: true, assigned_to: null, status: "new" })).toBe(false);
  });

  it("queues only unassigned chats where a person was requested", () => {
    expect(isQueued({ escalation_requested: true, assigned_to: null, status: "waiting" })).toBe(true);
    expect(isQueued({ escalation_requested: true, assigned_to: "u1", status: "waiting" })).toBe(false);
    expect(isQueued({ escalation_requested: false, assigned_to: null, status: "waiting" })).toBe(false);
  });

  it("treats abandoned as finished and excluded from reporting totals", () => {
    expect(CLOSED_STATUSES).toContain("abandoned");
    expect(EXCLUDED_STATUSES).toContain("abandoned");
    expect(QUEUE_STATUSES as readonly string[]).not.toContain("abandoned");
  });
});

describe("wait label", () => {
  const now = Date.parse("2026-09-10T12:00:00Z");
  it("formats minutes, hours and days", () => {
    expect(waitLabel("2026-09-10T11:53:00Z", now)).toBe("7m");
    expect(waitLabel("2026-09-10T09:55:00Z", now)).toBe("2h 05m");
    expect(waitLabel("2026-09-08T09:00:00Z", now)).toBe("2d 3h");
  });
  it("handles a missing timestamp", () => {
    expect(waitLabel(null, now)).toBe("—");
  });
});

describe("reopening a finished chat", () => {
  it("reopens resolved, closed and abandoned chats", () => {
    for (const status of REOPENABLE_STATUSES) {
      expect(
        decideReopen({ senderType: "visitor", status, assignedTo: null, assigneePresence: null }).reopens,
      ).toBe(true);
    }
  });

  it("ignores replies in a live chat and messages from staff", () => {
    expect(
      decideReopen({ senderType: "visitor", status: "active", assignedTo: null, assigneePresence: null })
        .reopens,
    ).toBe(false);
    expect(
      decideReopen({ senderType: "agent", status: "closed", assignedTo: null, assigneePresence: null })
        .reopens,
    ).toBe(false);
  });

  it("only re-queues a human when a person was involved before", () => {
    expect(
      decideReopen({
        senderType: "visitor",
        status: "closed",
        assignedTo: null,
        assigneePresence: null,
        firstHumanRequestedAt: null,
      }).toHuman,
    ).toBe(false);
    expect(
      decideReopen({
        senderType: "visitor",
        status: "closed",
        assignedTo: null,
        assigneePresence: null,
        firstHumanRequestedAt: "2026-09-01T00:00:00Z",
      }).toHuman,
    ).toBe(true);
  });

  it("keeps an available owner and requeues an unavailable one", () => {
    expect(
      decideReopen({
        senderType: "visitor",
        status: "closed",
        assignedTo: "u1",
        assigneePresence: "available",
        firstHumanRequestedAt: "2026-09-01T00:00:00Z",
      }).keepAssignee,
    ).toBe(true);
    for (const presence of ["busy", "away", "offline", null]) {
      expect(
        decideReopen({
          senderType: "visitor",
          status: "closed",
          assignedTo: "u1",
          assigneePresence: presence,
          firstHumanRequestedAt: "2026-09-01T00:00:00Z",
        }).keepAssignee,
      ).toBe(false);
    }
  });
});
