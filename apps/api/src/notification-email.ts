const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/gu,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

export function portalLink(path = "/") {
  if (!process.env.PUBLIC_URL)
    throw new Error("PUBLIC_URL is required for notification links");
  const origin = new URL(process.env.PUBLIC_URL);
  if (origin.protocol !== "https:")
    throw new Error("PUBLIC_URL must use HTTPS");
  return new URL(path, origin.origin).href;
}

export type EmailTemplate =
  | "document"
  | "approval"
  | "report"
  | "access"
  | "governance"
  | "service";

const templateCopy: Record<
  EmailTemplate,
  { header: string; action: string; footer: string; color: string }
> = {
  document: {
    header: "Document control",
    action: "Open document",
    footer:
      "This document notification was sent by ISMS Portal. Access permissions still apply.",
    color: "#0866d9",
  },
  approval: {
    header: "Action required",
    action: "Open approvals",
    footer:
      "Open ISMS Portal to review the request and record an authenticated decision. Do not reply to this automated message.",
    color: "#7a5100",
  },
  report: {
    header: "Report notification",
    action: "Open report",
    footer:
      "Use ISMS Portal to review or manage this report. Do not reply to this automated message.",
    color: "#b42318",
  },
  access: {
    header: "Access management",
    action: "Review access request",
    footer:
      "Use ISMS Portal to review this access request. Do not reply to this automated message.",
    color: "#5b3ea8",
  },
  governance: {
    header: "ISMS governance",
    action: "Open ISMS Portal",
    footer:
      "Use ISMS Portal to review the assigned action. Do not reply to this automated message.",
    color: "#005f73",
  },
  service: {
    header: "ISMS service alert",
    action: "Open ISMS Portal",
    footer: "This is an automated ISMS Portal service notification.",
    color: "#b54708",
  },
};

const lineBreaks = (text: string) => escapeHtml(text).replace(/\n/gu, "<br>");
const paragraphs = (text: string) =>
  text
    .split("\n\n")
    .map(
      (paragraph) => `<p style="margin:0 0 14px">${lineBreaks(paragraph)}</p>`,
    )
    .join("");

function emailFrame(
  subject: string,
  heading: string,
  color: string,
  contentHtml: string,
  footerHtml: string,
) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#172b4d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:Arial,Helvetica,sans-serif;background:#fff;border:1px solid #d9e2ef;border-radius:8px;table-layout:fixed">
<tr><td style="padding:20px 24px;border-bottom:4px solid ${color};font-size:13px;font-weight:bold;letter-spacing:0;word-break:break-word">${escapeHtml(heading)}</td></tr>
<tr><td style="padding:24px;word-wrap:break-word;overflow-wrap:anywhere"><h1 style="font-size:24px;line-height:1.3;margin:0 0 18px">${escapeHtml(subject.replace(/^\[ISMS Portal\]\s*/u, ""))}</h1>${contentHtml}</td></tr>
<tr><td style="padding:18px 24px;background:#edf3fa;font-size:12px;line-height:1.6;color:#52677f">${footerHtml}</td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

export function notificationHtml(
  subject: string,
  text: string,
  link = portalLink(),
  template: EmailTemplate = "service",
) {
  const url = new URL(link);
  if (url.protocol !== "https:" || url.origin !== new URL(portalLink()).origin)
    throw new Error("Invalid notification link");
  const copy = templateCopy[template];
  const href = escapeHtml(url.href);
  text = text.replace(/\r\n?/gu, "\n");
  const separator = text.lastIndexOf("\n---\n");
  const structured = subject.startsWith("[ISMS Portal] ") && separator >= 0;
  if (structured && (template === "approval" || template === "document")) {
    const body = text.slice(0, separator);
    const metadata = text.slice(separator + "\n---\n".length);
    if (template === "approval") {
      const decision = /\b(approved|rejected|decision)\b/iu.test(subject);
      const action = decision ? "Open decision" : "Review request";
      const description = decision
        ? "A decision has been recorded. Open ISMS Portal for the full history."
        : "Your action is required. Open ISMS Portal to review the request and record an authenticated decision.";
      return emailFrame(
        subject,
        `[ISMS Portal] | ${decision ? "DECISION RECORDED" : "ACTION REQUIRED"}`,
        copy.color,
        `<p style="font-size:14px;line-height:1.6;margin:0 0 20px;color:#52677f">${escapeHtml(description)}</p>
<div style="font-size:15px;line-height:1.65">${paragraphs(body)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr><td bgcolor="${copy.color}" style="border-radius:6px"><a href="${href}" style="display:inline-block;padding:13px 18px;color:#fff;font-size:15px;font-weight:bold;text-decoration:none">${action}</a></td></tr></table>
<p style="font-size:12px;color:#52677f;margin:20px 0 0">${escapeHtml(copy.footer)}</p>`,
        lineBreaks(metadata),
      );
    }
    return emailFrame(
      subject,
      subject,
      copy.color,
      `<p style="font-size:14px;line-height:1.6;margin:0 0 14px;color:#52677f">Automated notification from ISMS Portal. You are receiving this message because your organisation account has access to this document.</p>
<p style="font-size:15px;line-height:1.7;margin:0 0 22px">Click <a href="${href}" style="color:${copy.color};font-weight:bold">here to open the document</a>.</p>
<div style="font-size:15px;line-height:1.7">${paragraphs(body)}</div>`,
      lineBreaks(metadata),
    );
  }
  return emailFrame(
    subject,
    `ISMS PORTAL | ${copy.header.toUpperCase()}`,
    copy.color,
    `<div style="font-size:15px;line-height:1.7">${paragraphs(text)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td bgcolor="${copy.color}" style="border-radius:6px"><a href="${href}" style="display:inline-block;padding:14px 20px;color:#fff;font-size:15px;font-weight:bold;text-decoration:none">${escapeHtml(copy.action)}</a></td></tr></table>
<p style="font-size:12px;color:#52677f;margin-top:22px">${escapeHtml(copy.footer)}</p>
<p style="font-size:12px;word-break:break-all"><a href="${href}">${href}</a></p>`,
    "Automated notification from ISMS Portal.",
  );
}
