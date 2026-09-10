/**
 * Saved-reply helpers.
 *
 * Kept free of React and Supabase so the matching and substitution rules can be
 * tested directly — they are the part agents notice when they get them wrong.
 */

export type ResponseTemplate = {
  id: string;
  name: string;
  shortcut: string | null;
  category: string | null;
  body: string;
};

/** Fill the two placeholders the templates support. Unknown text is untouched. */
export function applyTemplateVars(
  body: string,
  vars: { visitorName?: string | null; agentName?: string | null },
): string {
  return body
    .replace(/\{visitor_name\}/g, vars.visitorName?.trim() || "there")
    .replace(/\{agent_name\}/g, vars.agentName?.trim() || "our team");
}

/**
 * The "/" shortcut the agent is currently typing, or null when they are not in
 * one. Only a "/" at the start of a line or after whitespace counts, so a URL
 * or a date never opens the picker.
 */
export function slashQuery(text: string, caret: number): string | null {
  const before = text.slice(0, Math.max(0, caret));
  const match = /(?:^|\s)\/([\w-]*)$/.exec(before);
  return match ? (match[1] ?? "") : null;
}

/** Replace the "/shortcut" fragment at the caret with the resolved body. */
export function replaceSlashQuery(text: string, caret: number, replacement: string): string {
  const before = text.slice(0, Math.max(0, caret));
  const after = text.slice(Math.max(0, caret));
  const match = /(?:^|\s)\/([\w-]*)$/.exec(before);
  if (!match) return text;
  const start = before.length - (match[0].startsWith("/") ? match[0].length : match[0].length - 1);
  return before.slice(0, start) + replacement + after;
}

/** Shortcut matches first, then name and category; case-insensitive. */
export function matchTemplates(
  templates: ResponseTemplate[],
  term: string,
  limit = 8,
): ResponseTemplate[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return templates.slice(0, limit);
  const scored = templates
    .map((t) => {
      const shortcut = (t.shortcut ?? "").toLowerCase();
      const name = t.name.toLowerCase();
      const category = (t.category ?? "").toLowerCase();
      let score = -1;
      if (shortcut && shortcut.startsWith(needle)) score = 0;
      else if (shortcut && shortcut.includes(needle)) score = 1;
      else if (name.startsWith(needle)) score = 2;
      else if (name.includes(needle)) score = 3;
      else if (category.includes(needle)) score = 4;
      return { t, score };
    })
    .filter((s) => s.score >= 0)
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.t);
}
