import { describe, expect, it } from "vitest";
import { defaultInboxTab, isInboxTab, tabForConversation } from "@/lib/inbox-tabs";

const ctx = { userId: "me", departmentIds: ["dept-a"], canViewAll: true };

describe("inbox landing tab", () => {
  it("lands on Waiting when visitors are queued", () => {
    expect(defaultInboxTab({ waiting: 2, active: 5, all: 40 })).toBe("waiting");
  });

  it("falls back to Active when nobody is waiting", () => {
    expect(defaultInboxTab({ waiting: 0, active: 3, all: 40 })).toBe("active");
  });

  it("falls back to All when nothing is waiting or active", () => {
    expect(defaultInboxTab({ waiting: 0, active: 0, all: 23 })).toBe("all");
    expect(defaultInboxTab(null)).toBe("all");
  });

  it("recognises only real tab names", () => {
    expect(isInboxTab("waiting")).toBe(true);
    expect(isInboxTab("nonsense")).toBe(false);
  });
});

describe("tab containing a conversation opened by link", () => {
  it("closed conversations belong to Closed", () => {
    expect(
      tabForConversation({ status: "resolved", assigned_to: "me", department_id: null }, ctx),
    ).toBe("closed");
  });

  it("my open conversation belongs to Mine", () => {
    expect(
      tabForConversation({ status: "active", assigned_to: "me", department_id: null }, ctx),
    ).toBe("mine");
  });

  it("an unclaimed queued conversation belongs to Waiting", () => {
    expect(
      tabForConversation({ status: "waiting", assigned_to: null, department_id: null }, ctx),
    ).toBe("waiting");
  });

  it("a colleague's live chat belongs to Active", () => {
    expect(
      tabForConversation({ status: "active", assigned_to: "someone", department_id: null }, ctx),
    ).toBe("active");
  });

  it("anything else falls back to All when the viewer may see everything", () => {
    expect(
      tabForConversation({ status: "new", assigned_to: null, department_id: null }, ctx),
    ).toBe("all");
  });

  it("uses the viewer's department when they cannot see everything", () => {
    expect(
      tabForConversation(
        { status: "new", assigned_to: null, department_id: "dept-a" },
        { ...ctx, canViewAll: false },
      ),
    ).toBe("department");
  });
});
