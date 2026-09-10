import { describe, expect, it } from "vitest";
import {
  appendNote,
  normalizeEmail,
  normalizePhone,
  visitorSuppliedDetails,
} from "@/lib/contact-normalize";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Casey.Rivera@Example.COM ")).toBe("casey.rivera@example.com");
  });

  it("returns null for empty input", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });

  it("does not carry PostgREST filter syntax through untouched casing", () => {
    // The value is always passed as a bound filter, but it must at least be
    // canonical so lookup and storage agree.
    expect(normalizeEmail("A@B.com,phone.eq.1")).toBe("a@b.com,phone.eq.1");
  });
});

describe("normalizePhone", () => {
  it("keeps digits only", () => {
    expect(normalizePhone("(555) 010-1234")).toBe("5550101234");
    expect(normalizePhone("+1 555 010 1234")).toBe("15550101234");
    expect(normalizePhone("555.010.1234")).toBe("5550101234");
  });

  it("treats differently formatted numbers as equal", () => {
    expect(normalizePhone("555-010-1234")).toBe(normalizePhone("(555) 010 1234"));
  });

  it("returns null when too short to identify anyone", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("visitorSuppliedDetails", () => {
  it("summarises what the visitor typed and says the contact was untouched", () => {
    const note = visitorSuppliedDetails({
      fullName: "Casey Rivera",
      county: "Los Angeles",
      healthPlan: "Plan A",
    });
    expect(note).toContain("Visitor-supplied details for staff review");
    expect(note).toContain("existing contact was not modified");
    expect(note).toContain("Name: Casey Rivera");
    expect(note).toContain("County: Los Angeles");
    expect(note).toContain("Health plan: Plan A");
  });

  it("handles a submission with nothing extra", () => {
    expect(visitorSuppliedDetails({})).toContain("none provided");
  });
});

describe("appendNote", () => {
  it("keeps the original reason above the appended block", () => {
    expect(appendNote("Needs a callback", "Details")).toBe("Needs a callback\n\nDetails");
  });

  it("returns the addition alone when there is no existing note", () => {
    expect(appendNote(null, "Details")).toBe("Details");
    expect(appendNote("   ", "Details")).toBe("Details");
  });
});
