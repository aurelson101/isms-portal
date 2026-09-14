export const escapeHtml = (value: string) => value.replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function portalLink(path = "/") {
  const origin = new URL(process.env.PUBLIC_URL || "https://isms.deftagroup.com");
  if (origin.protocol !== "https:") throw new Error("PUBLIC_URL must use HTTPS");
  return new URL(path, origin.origin).href;
}

export type EmailTemplate = "document" | "approval" | "report" | "access" | "governance" | "service";

const templateCopy: Record<EmailTemplate, { header: string; action: string; footer: string; color: string }> = {
  document: { header: "Document control", action: "Open document", footer: "This document notification was sent by ISMS Portal. Access permissions still apply.", color: "#0866d9" },
  approval: { header: "Approval required", action: "Review approval", footer: "Use ISMS Portal to record your decision. Do not reply to this automated message.", color: "#7a5100" },
  report: { header: "Report notification", action: "Open report", footer: "Use ISMS Portal to review or manage this report. Do not reply to this automated message.", color: "#b42318" },
  access: { header: "Access management", action: "Review access request", footer: "Use ISMS Portal to review this access request. Do not reply to this automated message.", color: "#5b3ea8" },
  governance: { header: "ISMS governance", action: "Open ISMS Portal", footer: "Use ISMS Portal to review the assigned action. Do not reply to this automated message.", color: "#005f73" },
  service: { header: "ISMS service alert", action: "Open ISMS Portal", footer: "This is an automated ISMS Portal service notification.", color: "#b54708" },
};

export function notificationHtml(subject: string, text: string, link = portalLink(), template: EmailTemplate = "service") {
  const url = new URL(link);
  if (url.protocol !== "https:" || url.origin !== new URL(portalLink()).origin) throw new Error("Invalid notification link");
  const copy = templateCopy[template];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#172b4d"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><!--[if mso]><table role="presentation" width="600"><tr><td><![endif]--><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #d9e2ef;border-radius:8px;table-layout:fixed"><tr><td style="padding:20px 24px;border-bottom:4px solid ${copy.color};font-size:13px;font-weight:bold;letter-spacing:.4px">ISMS PORTAL · ${escapeHtml(copy.header.toUpperCase())}</td></tr><tr><td style="padding:24px;word-wrap:break-word;overflow-wrap:anywhere"><h1 style="font-size:24px;line-height:1.3;margin:0 0 20px">${escapeHtml(subject.replace(/^\[ISMS Portal\]\s*/u, ""))}</h1><div style="font-size:15px;line-height:1.7">${escapeHtml(text).replace(/\n/gu, "<br>")}</div><table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td bgcolor="${copy.color}" style="border-radius:6px"><a href="${escapeHtml(url.href)}" style="display:inline-block;padding:14px 20px;color:#fff;font-size:15px;font-weight:bold;text-decoration:none">${escapeHtml(copy.action)}</a></td></tr></table><p style="font-size:12px;color:#52677f;margin-top:22px">${escapeHtml(copy.footer)}</p><p style="font-size:12px;word-break:break-all"><a href="${escapeHtml(url.href)}">${escapeHtml(url.href)}</a></p></td></tr><tr><td style="padding:20px 24px;background:#edf3fa;font-size:12px;color:#52677f">Automated notification from ISMS Portal.</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
}
