// Plain, inline-styled HTML email templates. Kept dependency-free (no MJML) —
// these are short transactional notes, not marketing emails.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shell(inner: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">${inner}
    <p style="margin-top:28px;font-size:12px;color:#9a9a9a">Sent from the We360 SEO dashboard.</p>
  </div>`;
}

export function taskAssignedEmail({ assigneeName, taskTitle, assignedByName, priority, url }: {
  assigneeName: string;
  taskTitle: string;
  assignedByName: string;
  priority: string;
  url: string;
}): { subject: string; html: string } {
  const subject = `New task assigned: ${taskTitle}`;
  const html = shell(`
    <p style="font-size:15px;margin:0 0 12px">Hi ${escapeHtml(assigneeName)},</p>
    <p style="font-size:15px;margin:0 0 16px">${escapeHtml(assignedByName)} assigned you a task:</p>
    <div style="border:1px solid #eee;border-radius:10px;padding:16px;margin:0 0 20px">
      <div style="font-size:16px;font-weight:600;margin-bottom:6px">${escapeHtml(taskTitle)}</div>
      <div style="font-size:13px;color:#6a6a6a">Priority: ${escapeHtml(priority)}</div>
    </div>
    <a href="${escapeHtml(url)}" style="display:inline-block;background:#5B45E0;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">Open in dashboard</a>`);
  return { subject, html };
}
