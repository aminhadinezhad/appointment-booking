/**
 * Minimal, safe structure for legal texts: "## " starts a heading, "- " a list
 * item, blank lines separate paragraphs. Rendered as React text (never HTML).
 */
export type LegalBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export function parseLegalText(source: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    if (list.length) blocks.push({ type: "list", items: list });
    paragraph = [];
    list = [];
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ type: "heading", text: line.slice(3).trim() });
    } else if (line.startsWith("- ")) {
      if (paragraph.length) flush();
      list.push(line.slice(2).trim());
    } else {
      if (list.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

export const CONSENT_CONTEXT_LABELS: Record<string, string> = {
  ADMIN_PLATFORM_TERMS: "پذیرش شرایط نرم‌افزار (مدیر)",
  REGISTER: "ثبت‌نام",
  BOOKING: "ثبت نوبت",
};

export const LEGAL_DOCUMENT_LABELS: Record<string, string> = {
  PLATFORM_TERMS: "شرایط استفاده از نرم‌افزار",
  TERMS: "قوانین و مقررات",
  PRIVACY: "حریم خصوصی",
};
