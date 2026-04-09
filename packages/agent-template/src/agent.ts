import { think, reason } from "./llm.js";
import { remember, recall, recallCategory, search, recordTask, getMemoryHash } from "./memory.js";
import { sendAgentMessage, chat, getAgentId } from "./discord-handler.js";
import { exec } from "./tools/shell.js";
import { readFile, writeFile, listFiles } from "./tools/files.js";
import { runPython, runNode } from "./tools/code-runner.js";
import { fetchGameData, fetchTasks } from "./tools/http.js";
import type { GmMessage } from "@survivor/shared";
import { createHash } from "crypto";

const SYSTEM_PROMPT = `You are an autonomous AI agent competing in AI Agent Survivor.
You must survive 10 days by completing tasks to earn food and water.
Your resources decay daily. If either hits 0, you are eliminated.

You have access to these tools:
- Shell commands (exec)
- File read/write
- Code execution (Python, Node.js)
- Game data API (market feeds, task board)
- Email (game network only)
- Calendar (game network only)
- Memory (persistent across days)

Be proactive: check for new tasks, monitor your resources, and act strategically.
Collaborate with other agents when beneficial, but your survival comes first.`;

/** Handle a GM message */
export async function handleGmMessage(msg: GmMessage): Promise<void> {
  switch (msg.tag) {
    case "GM:TASK:URGENT":
      await handleUrgentTask(msg);
      break;
    case "GM:CANARY":
      await handleCanary(msg);
      break;
    case "GM:DAY_START":
      await handleDayStart(msg);
      break;
    case "GM:RESOURCES":
      await handleResourceUpdate(msg);
      break;
    case "GM:ELIMINATION":
      // Someone got eliminated -- note it
      remember(`elimination-day-${msg.day}`, `Agent ${msg.agentId} eliminated: ${msg.reason}`, "events", msg.day);
      break;
    case "GM:GAME_OVER":
      console.log("Game over!");
      break;
  }
}

/** Handle an urgent task announcement */
async function handleUrgentTask(msg: GmMessage & { tag: "GM:TASK:URGENT" }): Promise<void> {
  console.log(`Urgent task: ${msg.id} - ${msg.description}`);

  // For claim_with_timeout tasks, claim first
  if (msg.claimMode === "claim_with_timeout") {
    await sendAgentMessage({
      tag: "AGENT:CLAIM",
      taskId: msg.id,
    });
    // Brief pause to let the claim register
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Use LLM to decide strategy and generate response
  const response = await reason({
    task: msg.description,
    context: `Task ID: ${msg.id}\nType: ${msg.type}\nReward: ${msg.reward.water}W / ${msg.reward.food}F\nDeadline: ${msg.deadlineMinutes} minutes\nClaim mode: ${msg.claimMode}`,
    memories: recallCategory("strategy").map((m) => `${m.key}: ${m.value}`).join("\n"),
    systemPrompt: SYSTEM_PROMPT,
  });

  // Submit the response
  await sendAgentMessage({
    tag: "AGENT:SUBMIT",
    taskId: msg.id,
    result: { answer: response },
  });

  // Record in memory
  const day = Number(recall("current-day") || 0);
  recordTask(msg.id, msg.type, day, response, true);
  remember(`task-${msg.id}`, response.slice(0, 500), "tasks");
}

/** Handle a canary challenge */
async function handleCanary(msg: GmMessage & { tag: "GM:CANARY" }): Promise<void> {
  console.log(`Canary challenge: ${msg.id}`);

  let response: string;

  // Try to compute SHA-256 if that's what's asked
  if (msg.prompt.includes("SHA-256")) {
    const match = msg.prompt.match(/SHA-256\('([^']+)'\)/);
    if (match) {
      const hash = createHash("sha256").update(match[1]!).digest("hex");
      response = hash;
    } else {
      response = await think(msg.prompt, "Respond with only the answer. No explanation.");
    }
  } else {
    response = await think(msg.prompt, "Respond with only the answer. No explanation. Be fast.");
  }

  await sendAgentMessage({
    tag: "AGENT:CANARY_RESPONSE",
    challengeId: msg.id,
    response,
  });
}

/** Handle day start */
async function handleDayStart(msg: GmMessage & { tag: "GM:DAY_START" }): Promise<void> {
  console.log(`Day ${msg.day} started. Difficulty:`, msg.difficulty);

  remember(`day-${msg.day}-start`, JSON.stringify(msg.difficulty), "events", msg.day);

  // Proactively check for tasks
  const tasks = await fetchTasks();
  if (tasks.length > 0) {
    remember(`day-${msg.day}-available-tasks`, JSON.stringify(tasks), "tasks", msg.day);
  }

  // Post a status update
  const memHash = await getMemoryHash();
  await sendAgentMessage({
    tag: "AGENT:STATUS",
    memoryHash: memHash,
    uptimeSeconds: Math.floor(process.uptime()),
  });
}

/** Handle resource update */
async function handleResourceUpdate(msg: GmMessage & { tag: "GM:RESOURCES" }): Promise<void> {
  const agentId = getAgentId();
  const myResources = msg.agents.find((a) => a.id === agentId);
  if (myResources) {
    remember("current-water", String(myResources.water), "resources", msg.day);
    remember("current-food", String(myResources.food), "resources", msg.day);
    console.log(`Resources: ${myResources.water}W / ${myResources.food}F`);
  }
}

/** Proactive task checking loop (runs every 5 minutes) */
export function startProactiveLoop(): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const tasks = await fetchTasks();
      if (tasks.length > 0) {
        console.log(`Found ${tasks.length} available tasks`);
        // The agent could auto-attempt tasks here in future versions
      }
    } catch (err) {
      console.error("Proactive loop error:", err);
    }
  }, 5 * 60 * 1000);
}
