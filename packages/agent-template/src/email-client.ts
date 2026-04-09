import { ImapFlow } from "imapflow";
import { createTransport, type Transporter } from "nodemailer";

let imap: ImapFlow;
let smtp: Transporter;

const MAIL_HOST = process.env.MAIL_HOST || "mail.survivor.local";
const MAIL_USER = process.env.MAIL_USER || "";
const MAIL_PASS = process.env.MAIL_PASS || "";

/** Initialize email client */
export async function initEmail(): Promise<void> {
  if (!MAIL_USER || !MAIL_PASS) {
    console.warn("Email credentials not configured, skipping email init");
    return;
  }

  // IMAP for reading
  imap = new ImapFlow({
    host: MAIL_HOST,
    port: 143,
    secure: false,
    auth: { user: MAIL_USER, pass: MAIL_PASS },
    logger: false,
  });
  await imap.connect();

  // SMTP for sending
  smtp = createTransport({
    host: MAIL_HOST,
    port: 587,
    secure: false,
    auth: { user: MAIL_USER, pass: MAIL_PASS },
  });

  console.log(`Email connected as ${MAIL_USER}@survivor.local`);
}

/** Check for new unread emails */
export async function checkInbox(): Promise<
  Array<{ from: string; subject: string; text: string; date: string }>
> {
  if (!imap) return [];

  const lock = await imap.getMailboxLock("INBOX");
  try {
    const messages: Array<{ from: string; subject: string; text: string; date: string }> = [];

    for await (const msg of imap.fetch({ seen: false }, { source: true, envelope: true })) {
      const envelope = msg.envelope as any;
      messages.push({
        from: envelope?.from?.[0]?.address || "unknown",
        subject: envelope?.subject || "",
        text: msg.source?.toString() || "",
        date: envelope?.date?.toISOString() || "",
      });
    }

    return messages;
  } finally {
    lock.release();
  }
}

/** Send an email */
export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (!smtp) return false;

  try {
    await smtp.sendMail({
      from: `${MAIL_USER}@survivor.local`,
      to,
      subject,
      text: body,
    });
    return true;
  } catch (err) {
    console.error("Failed to send email:", err);
    return false;
  }
}

/** Disconnect email */
export async function disconnectEmail(): Promise<void> {
  if (imap) await imap.logout();
}
