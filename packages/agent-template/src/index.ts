import { initMemory } from "./memory.js";
import { initLlm } from "./llm.js";
import { initAgentDiscord, onGmMessage } from "./discord-handler.js";
import { initEmail } from "./email-client.js";
import { handleGmMessage, startProactiveLoop } from "./agent.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const AGENT_ID = process.env.AGENT_ID;

if (!DISCORD_TOKEN || !GUILD_ID || !AGENT_ID) {
  console.error("Missing required environment variables: DISCORD_TOKEN, GUILD_ID, AGENT_ID");
  process.exit(1);
}

async function main() {
  console.log(`Agent ${AGENT_ID} starting...`);

  // Initialize subsystems
  console.log("Initializing memory...");
  initMemory();

  console.log("Initializing LLM...");
  initLlm();

  console.log("Connecting to Discord...");
  await initAgentDiscord(DISCORD_TOKEN!, GUILD_ID!, AGENT_ID!);

  console.log("Connecting to email...");
  try {
    await initEmail();
  } catch (err) {
    console.warn("Email init failed (may not be available yet):", err);
  }

  // Register GM message handler
  onGmMessage(handleGmMessage);

  // Start proactive task checking
  const proactiveTimer = startProactiveLoop();

  console.log(`Agent ${AGENT_ID} is running and ready to survive.`);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("Shutting down...");
    clearInterval(proactiveTimer);
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("Shutting down...");
    clearInterval(proactiveTimer);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Agent fatal error:", err);
  process.exit(1);
});
