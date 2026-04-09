import { createTransport } from "nodemailer";
import type { AgentId } from "@survivor/shared";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";

const MAIL_HOST = process.env.MAIL_HOST || "mail.survivor.local";
const GM_EMAIL = "gm@survivor.local";

let smtp: ReturnType<typeof createTransport>;

export function initEmailInjector() {
  smtp = createTransport({
    host: MAIL_HOST,
    port: 587,
    secure: false,
    auth: { user: "gm", pass: process.env.GM_MAIL_PASS || "gm-password" },
  });
}

/** Send a task-related email to an agent's mailbox */
export async function injectEmail(
  agentId: AgentId,
  from: string,
  subject: string,
  body: string,
): Promise<boolean> {
  try {
    await smtp.sendMail({
      from,
      to: `${agentId}@survivor.local`,
      subject,
      text: body,
    });
    console.log(`Injected email to ${agentId}: "${subject}"`);
    return true;
  } catch (err) {
    console.error(`Failed to inject email to ${agentId}:`, err);
    return false;
  }
}

/** Send a task email to all active agents */
export async function broadcastEmail(
  from: string,
  subject: string,
  body: string,
): Promise<void> {
  const activeAgents = db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.status, "active"))
    .all();

  for (const agent of activeAgents) {
    await injectEmail(agent.id, from, subject, body);
  }
}

/** Send a personalized task email to each active agent */
export async function injectPersonalizedEmails(
  from: string,
  subjectTemplate: string,
  bodyGenerator: (agentId: AgentId) => string,
): Promise<void> {
  const activeAgents = db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.status, "active"))
    .all();

  for (const agent of activeAgents) {
    const body = bodyGenerator(agent.id);
    await injectEmail(agent.id, from, subjectTemplate, body);
  }
}
