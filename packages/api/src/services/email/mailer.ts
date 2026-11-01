import { createTransport, type Transporter } from "nodemailer";

export type EmailMessage = { to: string; subject: string; text: string; html: string };

let cached: Transporter | null | undefined;

/** The SMTP connection from SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM; null when not set up. */
function transport() {
  if (cached !== undefined) return cached;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !MAIL_FROM) {
    cached = null;
    return cached;
  }
  const port = Number(SMTP_PORT ?? 587);
  cached = createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return cached;
}

/** Sends one email. False when email isn't set up on this server (nothing is sent). */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const smtp = transport();
  if (!smtp) return false;
  await smtp.sendMail({ from: process.env.MAIL_FROM, ...message });
  return true;
}
