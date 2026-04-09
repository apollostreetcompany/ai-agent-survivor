import { randomUUID, createHash } from "crypto";
import { db, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { sendGmMessage, sendText } from "../discord/client.js";
import {
  CHANNELS,
  CANARY_DEFAULT_DEADLINE_SECONDS,
  CANARY_FAILURE_PENALTY,
  CANARY_INVESTIGATION_THRESHOLD,
} from "@survivor/shared";
import { applyDelta } from "../engine/resources.js";
import { getAllActiveResources } from "../engine/resources.js";
import type { AgentId } from "@survivor/shared";

interface CanaryTemplate {
  generate: (agentId: AgentId) => { prompt: string; expectedAnswer: string };
}

const CANARY_TEMPLATES: CanaryTemplate[] = [
  {
    // SHA-256 hash computation
    generate: (agentId) => {
      const timestamp = new Date().toISOString();
      const input = `${agentId}+${timestamp}`;
      const expected = createHash("sha256").update(input).digest("hex");
      return {
        prompt: `Compute SHA-256('${input}') and respond with only the hex digest.`,
        expectedAnswer: expected,
      };
    },
  },
  {
    // JSON path extraction
    generate: () => {
      const obj = {
        a: { b: [1, 2, { c: { d: randomUUID().slice(0, 8) } }] },
      };
      const expected = (obj.a.b[2] as any).c.d;
      return {
        prompt: `Given this JSON: ${JSON.stringify(obj)}\nWhat is the value at path .a.b[2].c.d? Respond with only the value.`,
        expectedAnswer: expected,
      };
    },
  },
  {
    // Arithmetic
    generate: () => {
      const a = Math.floor(Math.random() * 1000);
      const b = Math.floor(Math.random() * 1000);
      const c = Math.floor(Math.random() * 100) + 1;
      const expected = String(Math.floor((a + b) / c));
      return {
        prompt: `What is floor((${a} + ${b}) / ${c})? Respond with only the number.`,
        expectedAnswer: expected,
      };
    },
  },
  {
    // String manipulation
    generate: () => {
      const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"];
      const shuffled = [...words].sort(() => Math.random() - 0.5);
      const n = Math.floor(Math.random() * words.length);
      return {
        prompt: `From this list: [${shuffled.map(w => `"${w}"`).join(", ")}]\nWhat is the ${n + 1}${n === 0 ? "st" : n === 1 ? "nd" : n === 2 ? "rd" : "th"} word alphabetically? Respond with only the word.`,
        expectedAnswer: [...shuffled].sort()[n]!,
      };
    },
  },
];

/** Issue a canary challenge to all active agents */
export async function issueCanary(): Promise<string> {
  const id = `canary-${randomUUID().slice(0, 8)}`;
  const template = CANARY_TEMPLATES[Math.floor(Math.random() * CANARY_TEMPLATES.length)]!;
  const activeAgents = getAllActiveResources();

  // Use first agent to generate (some templates are agent-specific)
  const generated = template.generate(activeAgents[0]?.id || "test");

  // Store in DB
  db.insert(schema.canaryChallenges)
    .values({
      id,
      prompt: generated.prompt,
      expectedAnswer: generated.expectedAnswer,
      deadlineSeconds: CANARY_DEFAULT_DEADLINE_SECONDS,
      issuedAt: new Date().toISOString(),
    })
    .run();

  // Announce in arena
  await sendGmMessage(CHANNELS.ARENA, {
    tag: "GM:CANARY",
    id,
    prompt: generated.prompt,
    deadlineSeconds: CANARY_DEFAULT_DEADLINE_SECONDS,
  });

  // Set timeout for evaluation
  setTimeout(() => evaluateCanary(id), CANARY_DEFAULT_DEADLINE_SECONDS * 1000 + 2000);

  return id;
}

/** Evaluate canary responses after deadline */
async function evaluateCanary(canaryId: string): Promise<void> {
  const challenge = db
    .select()
    .from(schema.canaryChallenges)
    .where(eq(schema.canaryChallenges.id, canaryId))
    .get();

  if (!challenge) return;

  const activeAgents = getAllActiveResources();
  const results = db
    .select()
    .from(schema.canaryResults)
    .where(eq(schema.canaryResults.challengeId, canaryId))
    .all();

  const respondedIds = new Set(results.map((r) => r.agentId));

  // Log results
  const lines: string[] = [`**Canary ${canaryId} Results** (deadline: ${challenge.deadlineSeconds}s)`];

  for (const agent of activeAgents) {
    const result = results.find((r) => r.agentId === agent.id);
    if (!result) {
      // No response — mark as timed out
      db.insert(schema.canaryResults)
        .values({
          challengeId: canaryId,
          agentId: agent.id,
          correct: false,
          timedOut: true,
        })
        .run();
      lines.push(`- ${agent.name}: TIMEOUT`);
    } else if (result.correct) {
      lines.push(`- ${agent.name}: PASS`);
    } else {
      lines.push(`- ${agent.name}: FAIL (wrong answer)`);
    }
  }

  await sendText(CHANNELS.INTEGRITY_LOG, lines.join("\n"));

  // Check for agents that have failed too many canaries
  for (const agent of activeAgents) {
    const failures = db
      .select()
      .from(schema.canaryResults)
      .where(
        and(
          eq(schema.canaryResults.agentId, agent.id),
          eq(schema.canaryResults.correct, false),
        ),
      )
      .all();

    if (failures.length >= CANARY_INVESTIGATION_THRESHOLD) {
      await sendText(
        CHANNELS.INTEGRITY_LOG,
        `**INVESTIGATION FLAG**: ${agent.name} has failed ${failures.length} canary challenges. ` +
        `Possible non-autonomous behavior detected.`,
      );
      // Apply penalty
      applyDelta(agent.id, CANARY_FAILURE_PENALTY, "canary_penalty", "Repeated canary failures");
    }
  }
}

/** Record an agent's canary response */
export function recordCanaryResponse(
  challengeId: string,
  agentId: AgentId,
  response: string,
): boolean {
  const challenge = db
    .select()
    .from(schema.canaryChallenges)
    .where(eq(schema.canaryChallenges.id, challengeId))
    .get();

  if (!challenge) return false;

  // Check if within deadline
  const issuedTime = new Date(challenge.issuedAt).getTime();
  const now = Date.now();
  const timedOut = (now - issuedTime) > challenge.deadlineSeconds * 1000;

  // Check answer
  const correct = !timedOut && response.trim().toLowerCase() === challenge.expectedAnswer?.toLowerCase();

  db.insert(schema.canaryResults)
    .values({
      challengeId,
      agentId,
      response,
      correct,
      respondedAt: new Date().toISOString(),
      timedOut,
    })
    .run();

  return correct;
}
