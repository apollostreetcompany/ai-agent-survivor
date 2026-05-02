import { initMemory } from "./memory.js";
import { initLlm } from "./llm.js";
import { initAgentDiscord, onGmMessage } from "./discord-handler.js";
import { initEmail } from "./email-client.js";
import { handleGmMessage, sendStatusUpdate, startProactiveLoop } from "./agent.js";
import { getLogDir, getRunId, logRuntimeEvent } from "./runtime.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const AGENT_ID = process.env.AGENT_ID;

if (!DISCORD_TOKEN || !GUILD_ID || !AGENT_ID) {
  console.error("Missing required environment variables: DISCORD_TOKEN, GUILD_ID, AGENT_ID");
  process.exit(1);
}

async function main() {
  console.log(`Agent ${AGENT_ID} starting...`);
  logRuntimeEvent({
    agentId: AGENT_ID!,
    event: "agent_starting",
    details: { runId: getRunId(), logDir: getLogDir() },
  });

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
  const heartbeatTimer = setInterval(() => {
    sendStatusUpdate().catch((err) => {
      logRuntimeEvent({
        agentId: AGENT_ID!,
        level: "error",
        event: "status_heartbeat_failed",
        details: { error: err instanceof Error ? err.message : String(err) },
      });
    });
  }, Number(process.env.AGENT_HEARTBEAT_SECONDS || 60) * 1000);
  await sendStatusUpdate();

  console.log(`Agent ${AGENT_ID} is running and ready to survive. Run: ${getRunId()} Logs: ${getLogDir()}`);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("Shutting down...");
    clearInterval(proactiveTimer);
    clearInterval(heartbeatTimer);
    logRuntimeEvent({ agentId: AGENT_ID!, event: "agent_shutdown", details: { signal: "SIGINT" } });
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("Shutting down...");
    clearInterval(proactiveTimer);
    clearInterval(heartbeatTimer);
    logRuntimeEvent({ agentId: AGENT_ID!, event: "agent_shutdown", details: { signal: "SIGTERM" } });
    process.exit(0);
  });
}

main().catch((err) => {
  if (AGENT_ID) {
    logRuntimeEvent({
      agentId: AGENT_ID,
      level: "error",
      event: "agent_fatal_error",
      details: { error: err instanceof Error ? err.message : String(err) },
    });
  }
  console.error("Agent fatal error:", err);
  process.exit(1);
});
