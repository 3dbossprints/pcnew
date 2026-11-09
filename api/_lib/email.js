import nodemailer from "nodemailer";

let transporter;

function getTransporter() {
  const host = process.env.GMAIL_HOST || "smtp.gmail.com";
  const port = Number(process.env.GMAIL_PORT || 465);
  const secure = process.env.GMAIL_SECURE
    ? process.env.GMAIL_SECURE.toLowerCase() === "true"
    : port === 465;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error("Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("GMAIL_PORT must be a valid TCP port.");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }
  return transporter;
}

export async function sendEmail({ to, subject, text, html, replyTo }) {
  if (!to || !subject || (!text && !html)) {
    throw new Error("Email requires a recipient, subject and text or HTML body.");
  }
  const from = process.env.GMAIL_FROM || `Music Coach <${process.env.GMAIL_USER || "noreply@musiccoach.cc.cd"}>`;
  return getTransporter().sendMail({
    from,
    to,
    subject,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
    ...(replyTo ? { replyTo } : {}),
  });
}
