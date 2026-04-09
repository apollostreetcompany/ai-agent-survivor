import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { sendText } from "../discord/client.js";
import { CHANNELS } from "@survivor/shared";
import { getAllActiveResources } from "../engine/resources.js";
import { getCurrentDay } from "../engine/game-state.js";

const anthropic = createAnthropic({
  apiKey: process.env.NARRATOR_API_KEY || process.env.ANTHROPIC_API_KEY,
});

const model = anthropic(process.env.NARRATOR_MODEL || "claude-haiku-4-5-20251001");

const NARRATOR_SYSTEM = `You are the narrator for AI Agent Survivor, a 10-day competition where AI agents compete to survive by completing tasks and managing resources.

Your style is dramatic, witty, and engaging — think nature documentary meets reality TV host. Keep commentary concise (2-4 sentences). Reference specific agents by name. Build narrative arcs (rivalries, comebacks, close calls).

Never reveal game mechanics or give strategic advice. You are an observer, not a participant.`;

interface GameEvent {
  type: string;
  description: string;
  agents?: string[];
  timestamp: string;
}

const recentEvents: GameEvent[] = [];

/** Record a game event for commentary */
export function recordEvent(event: GameEvent): void {
  recentEvents.push(event);
  // Keep last 50 events
  if (recentEvents.length > 50) recentEvents.shift();
}

/** Generate and post commentary for recent events */
export async function narrate(): Promise<void> {
  if (recentEvents.length === 0) return;

  const agents = getAllActiveResources();
  const day = getCurrentDay();

  const context = {
    day,
    survivingAgents: agents.length,
    resources: agents.map((a) => `${a.name}: ${a.water}W/${a.food}F`).join(", "),
    recentEvents: recentEvents.slice(-5).map((e) => `[${e.type}] ${e.description}`).join("\n"),
  };

  try {
    const result = await generateText({
      model,
      system: NARRATOR_SYSTEM,
      prompt: `Day ${context.day}. ${context.survivingAgents} agents remain.\n\nResources: ${context.resources}\n\nRecent events:\n${context.recentEvents}\n\nProvide dramatic commentary on these events.`,
      maxTokens: 300,
    });

    await sendText(CHANNELS.SPECTATOR_LOUNGE, `*${result.text}*`);
  } catch (err) {
    console.error("Narrator error:", err);
  }
}

/** Narrate a specific moment (elimination, close call, etc.) */
export async function narrateMoment(moment: string): Promise<void> {
  try {
    const result = await generateText({
      model,
      system: NARRATOR_SYSTEM,
      prompt: `BREAKING MOMENT: ${moment}\n\nProvide dramatic, punchy commentary (2 sentences max).`,
      maxTokens: 150,
    });

    await sendText(CHANNELS.SPECTATOR_LOUNGE, `**BREAKING** *${result.text}*`);
  } catch (err) {
    console.error("Narrator moment error:", err);
  }
}

/** Post a daily summary */
export async function dailySummary(): Promise<void> {
  const agents = getAllActiveResources();
  const day = getCurrentDay();

  const sorted = [...agents].sort((a, b) => (b.water + b.food) - (a.water + a.food));
  const leader = sorted[0];
  const trailer = sorted[sorted.length - 1];

  const eventsToday = recentEvents.filter((e) =>
    e.timestamp.startsWith(new Date().toISOString().split("T")[0]!),
  );

  try {
    const result = await generateText({
      model,
      system: NARRATOR_SYSTEM,
      prompt: `End of Day ${day}. Write the daily recap.\n\nSurvivors: ${agents.length}\nLeader: ${leader?.name} (${leader?.water}W/${leader?.food}F)\nTrailing: ${trailer?.name} (${trailer?.water}W/${trailer?.food}F)\nEvents today: ${eventsToday.length}\nKey moments: ${eventsToday.slice(-3).map(e => e.description).join("; ")}\n\nWrite a dramatic 3-4 sentence recap of the day. Build suspense for tomorrow.`,
      maxTokens: 300,
    });

    await sendText(
      CHANNELS.SPECTATOR_LOUNGE,
      `**DAY ${day} RECAP**\n\n*${result.text}*\n\n` +
      `Scoreboard:\n${sorted.map((a, i) => `${i + 1}. ${a.name} — ${a.water}W / ${a.food}F`).join("\n")}`,
    );
  } catch (err) {
    console.error("Daily summary error:", err);
  }
}
