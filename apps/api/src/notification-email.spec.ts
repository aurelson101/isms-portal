import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { notificationHtml, type EmailTemplate } from "./notification-email";

const templates: EmailTemplate[] = ["document", "approval", "report", "access", "governance", "service"];
beforeEach(() => vi.stubEnv("PUBLIC_URL", "https://isms.example.test"));
afterEach(() => vi.unstubAllEnvs());

it.each(templates)("shares the responsive frame and Outlook wrapper for %s", template => {
  const html = notificationHtml("[ISMS Portal] Sample", "Body\n---\nRecorded at: 2026-10-17", undefined, template);
  expect(html).toContain('lang="en"');
  expect(html).toContain("max-width:600px");
  expect(html).toContain('<!--[if mso]><table role="presentation" width="600">');
  expect(html.match(/<h1\b/g)).toHaveLength(1);
});

it.each(["document", "approval"] as const)("preserves separators within the %s message body and retains final metadata", template => {
  const html = notificationHtml("[ISMS Portal] Sample", "Before separator\n---\nQuoted section\n\nFinal paragraph\n---\nRecorded at: 2026-10-17", undefined, template);
  expect(html).toContain("Before separator<br>---<br>Quoted section");
  expect(html).toContain("Final paragraph");
  expect(html).toContain("Recorded at: 2026-10-17");
});

it("preserves Windows line breaks and paragraphs in document descriptions", () => {
  const html = notificationHtml("[ISMS Portal] Sample", "First line\r\nSecond line\r\n\r\nNext paragraph\r\n---\r\nRecorded at: 2026-10-17", undefined, "document");
  expect(html).toContain("First line<br>Second line");
  expect(html).toContain('margin:0 0 14px">Next paragraph</p>');
  expect(html).not.toContain("\r");
});

it.each(templates)("escapes untrusted subject, body and metadata in %s", template => {
  const html = notificationHtml('[ISMS Portal] <img src=x onerror="bad()">', "<script>bad()</script>\n---\n<iframe>metadata</iframe>", undefined, template);
  expect(html).not.toMatch(/<(?:script|img|iframe)\b/);
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&lt;iframe&gt;metadata&lt;/iframe&gt;");
});

it.each(["https://untrusted.example/", "http://isms.example.test/", "javascript:alert(1)", "https://isms.example.test.untrusted.example/"])("rejects an unsafe action link %s", link => {
  expect(() => notificationHtml("Subject", "Body", link)).toThrow("Invalid notification link");
});
