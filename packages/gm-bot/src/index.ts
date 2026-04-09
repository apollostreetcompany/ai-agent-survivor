import { initDb } from "./db/index.js";
import { initDiscord, sendGmMessage, sendText } from "./discord/client.js";
import { handleMessage } from "./discord/events/message-handler.js";
import { startScheduler } from "./engine/scheduler.js";
import { getAllActiveResources } from "./engine/resources.js";
import { getCurrentDay } from "./engine/game-state.js";
import { getDifficultyForDay } from "./engine/difficulty.js";
import { getPhase } from "./engine/game-state.js";
import { CHANNELS } from "@survivor/shared";
import { initEmailInjector } from "./environment/email-injector.js";
import { initFeeds } from "./environment/feed-updater.js";
import { narrateMoment } from "./commentary/narrator.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!DISCORD_TOKEN || !GUILD_ID) {
  console.error("Missing DISCORD_TOKEN or GUILD_ID environment variables");
  process.exit(1);
}

async function main() {
  // Initialize database
  console.log("Initializing database...");
  initDb();

  // Initialize environment services
  console.log("Initializing environment services...");
  initFeeds();
  try { initEmailInjector(); } catch (err) { console.warn("Email injector init failed:", err); }

  // Connect to Discord
  console.log("Connecting to Discord...");
  const client = await initDiscord(DISCORD_TOKEN!, GUILD_ID!);

  // Register message handler
  client.on("messageCreate", handleMessage);

  // Start scheduler
  console.log("Starting scheduler...");
  startScheduler({
    onDayStart: async (day) => {
      const diff = getDifficultyForDay(day);
      await sendGmMessage(CHANNELS.ANNOUNCEMENTS, {
        tag: "GM:DAY_START",
        day,
        difficulty: diff,
      });

      await sendText(
        CHANNELS.ANNOUNCEMENTS,
        `--- DAY ${day} ---\n` +
        `Difficulty: complexity=${diff.complexity} time=${diff.timePressure} ` +
        `tools=${diff.toolChaining} memory=${diff.memoryRequired} ambiguity=${diff.ambiguity}\n` +
        `Survive or be eliminated.`,
      );
    },

    onDailyDecay: async (eliminated) => {
      const day = getCurrentDay();
      const agents = getAllActiveResources();
      await sendGmMessage(CHANNELS.SCOREBOARD, {
        tag: "GM:RESOURCES",
        day,
        agents: agents.map((a) => ({ id: a.id, water: a.water, food: a.food })),
      });

      // Format scoreboard
      const sorted = [...agents].sort((a, b) => (b.water + b.food) - (a.water + a.food));
      const board = sorted
        .map((a, i) => `${i + 1}. **${a.name}** — ${a.water}W / ${a.food}F`)
        .join("\n");
      await sendText(CHANNELS.SCOREBOARD, `**SCOREBOARD — Day ${day}**\n${board}`);

      for (const agentId of eliminated) {
        const agent = sorted.find((a) => a.id === agentId);
        await sendGmMessage(CHANNELS.ANNOUNCEMENTS, {
          tag: "GM:ELIMINATION",
          agentId,
          day,
          reason: "Resources depleted",
          finalResources: { water: 0, food: 0 },
        });
        await sendText(
          CHANNELS.ANNOUNCEMENTS,
          `**ELIMINATED**: ${agent?.name || agentId} has run out of resources.`,
        );
        try {
          await narrateMoment(`${agent?.name || agentId} has been eliminated on Day ${day}. Their resources hit zero.`);
        } catch {}
      }
    },

    onTaskExpiry: async (expiredIds) => {
      for (const taskId of expiredIds) {
        await sendText(CHANNELS.ARENA, `Task **${taskId}** has expired.`);
      }
    },

    onGameOver: async () => {
      const day = getCurrentDay();
      const survivors = getAllActiveResources();
      await sendGmMessage(CHANNELS.ANNOUNCEMENTS, {
        tag: "GM:GAME_OVER",
        day,
        survivors: survivors.map((a) => ({
          id: a.id,
          resources: { water: a.water, food: a.food },
        })),
      });
      await sendText(
        CHANNELS.ANNOUNCEMENTS,
        `**GAME OVER**\n${survivors.length} agent(s) survived the ${day}-day gauntlet!\n` +
        survivors.map((a) => `- **${a.name}**: ${a.water}W / ${a.food}F`).join("\n"),
      );
      try {
        await narrateMoment(`The game is over! ${survivors.length} agents survived all ${day} days.`);
      } catch {}
    },
  });

  console.log(`GM Bot is running. Phase: ${getPhase()}`);
}

main().catch((err) => {
  console.error("GM Bot fatal error:", err);
  process.exit(1);
});
