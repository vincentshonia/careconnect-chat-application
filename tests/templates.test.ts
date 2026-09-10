import { describe, expect, it } from "vitest";
import {
  applyTemplateVars,
  matchTemplates,
  replaceSlashQuery,
  slashQuery,
  type ResponseTemplate,
} from "@/lib/templates";
import { claimBlockReason } from "@/lib/claim-eligibility";

const templates: ResponseTemplate[] = [
  { id: "1", name: "Office hours", shortcut: "hours", category: null, body: "We are open 9-5." },
  {
    id: "2",
    name: "Greeting",
    shortcut: "hi",
    category: null,
    body: "Hi {visitor_name}, this is {agent_name}.",
  },
];

describe("response templates", () => {
  it("substitutes visitor and agent names with sensible fallbacks", () => {
    expect(
      applyTemplateVars(templates[1]!.body, { visitorName: "Ana", agentName: "Sam" }),
    ).toBe("Hi Ana, this is Sam.");
    expect(applyTemplateVars(templates[1]!.body, { visitorName: null, agentName: null })).not.toContain(
      "{visitor_name}",
    );
  });

  it("detects a slash query only at the start of a word", () => {
    expect(slashQuery("/hou", 4)).toBe("hou");
    expect(slashQuery("please /ho", 10)).toBe("ho");
    expect(slashQuery("and/or", 6)).toBeNull();
    expect(slashQuery("no slash here", 5)).toBeNull();
  });

  it("matches templates by shortcut and name", () => {
    expect(matchTemplates(templates, "hou").map((t) => t.id)).toEqual(["1"]);
    expect(matchTemplates(templates, "greet").map((t) => t.id)).toEqual(["2"]);
    expect(matchTemplates(templates, "").length).toBe(2);
  });

  it("replaces the typed shortcut with the template body", () => {
    expect(replaceSlashQuery("Hello /hours", 12, "We are open 9-5.")).toBe(
      "Hello We are open 9-5.",
    );
  });
});

describe("claim eligibility", () => {
  const base = {
    presence: "available",
    activeChats: 1,
    maxChats: 3,
    departmentId: "d1",
    myDepartmentIds: ["d1"],
    isSupervisor: false,
  };

  it("allows a normal available agent in the department", () => {
    expect(claimBlockReason(base)).toBeNull();
  });

  it("explains away, capacity and department blocks", () => {
    expect(claimBlockReason({ ...base, presence: "away" })).toMatch(/available/i);
    expect(claimBlockReason({ ...base, activeChats: 3 })).toMatch(/capacity|chats/i);
    expect(claimBlockReason({ ...base, myDepartmentIds: ["other"] })).toMatch(/department/i);
  });

  it("lets a supervisor claim outside their department", () => {
    expect(
      claimBlockReason({ ...base, myDepartmentIds: ["other"], isSupervisor: true }),
    ).toBeNull();
  });
});
