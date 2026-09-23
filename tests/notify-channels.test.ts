import { describe, expect, it } from "vitest";
import {
  CHAT_ALERT_TYPES,
  CONSOLE_ORIGIN,
  EMAIL_PREF_COLUMN,
  consoleLink,
  emailIdempotencyKey,
  isChatAlertType,
  ringCentralText,
} from "@/lib/notify-channels";

describe("chat alert gating", () => {
  it("fires only for the three chat-needs-a-human events", () => {
    expect([...CHAT_ALERT_TYPES]).toEqual(["escalation", "new_intake", "visitor_reply"]);
    for (const type of CHAT_ALERT_TYPES) expect(isChatAlertType(type)).toBe(true);
    for (const type of ["sla_breach", "low_rating", "anything"]) {
      expect(isChatAlertType(type)).toBe(false);
    }
  });

  it("maps each type to its email preference column, visitor replies following escalations", () => {
    expect(EMAIL_PREF_COLUMN.escalation).toBe("email_escalations");
    expect(EMAIL_PREF_COLUMN.new_intake).toBe("email_new_intake");
    expect(EMAIL_PREF_COLUMN.visitor_reply).toBe("email_escalations");
  });
});

describe("console links", () => {
  it("deep-links to the conversation thread when the record is a conversation", () => {
    expect(consoleLink("conversations", "abc-123")).toBe(`${CONSOLE_ORIGIN}/inbox?c=abc-123`);
  });

  it("falls back to the inbox for other records", () => {
    expect(consoleLink("intake_requests", "abc-123")).toBe(`${CONSOLE_ORIGIN}/inbox`);
    expect(consoleLink(null, null)).toBe(`${CONSOLE_ORIGIN}/inbox`);
  });
});

describe("outgoing message shapes", () => {
  it("names the department and visitor and carries a link", () => {
    const text = ringCentralText({
      departmentName: "Member Engagement",
      title: "New chat waiting for a human",
      link: `${CONSOLE_ORIGIN}/inbox?c=xyz`,
      visitorName: "Jane Doe",
    });
    expect(text).toContain("Member Engagement");
    expect(text).toContain("Visitor: Jane Doe");
    expect(text).toContain(`${CONSOLE_ORIGIN}/inbox?c=xyz`);
  });

  it("falls back to a generic visitor when no name is known", () => {
    const text = ringCentralText({
      departmentName: "Member Engagement",
      title: "New chat waiting for a human",
      link: `${CONSOLE_ORIGIN}/inbox?c=xyz`,
    });
    expect(text).toContain("Visitor: a website visitor");
  });

  it("dedupes an email per conversation, person and type", () => {
    const key = emailIdempotencyKey("conv-1", "user-1", "escalation");
    expect(key).toBe(emailIdempotencyKey("conv-1", "user-1", "escalation"));
    expect(key).not.toBe(emailIdempotencyKey("conv-1", "user-2", "escalation"));
    expect(key).not.toBe(emailIdempotencyKey("conv-2", "user-1", "escalation"));
    expect(key).not.toBe(emailIdempotencyKey("conv-1", "user-1", "new_intake"));
  });
});
