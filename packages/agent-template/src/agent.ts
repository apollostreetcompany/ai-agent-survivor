import { think, reason } from "./llm.js";
import { remember, recall, recallCategory, recordTask, getMemoryHash, hasTaskHistory } from "./memory.js";
import { sendAgentMessage, chat, getAgentId } from "./discord-handler.js";
import { listFiles } from "./tools/files.js";
import { fetchGameData, fetchTasks } from "./tools/http.js";
import type { GmMessage } from "@survivor/shared";
import { createHash } from "crypto";
import { logRuntimeEvent, writeLocalHeartbeat } from "./runtime.js";

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

interface TaskBoardTask {
  id: string;
  type: string;
  source?: string;
  claimMode?: string;
  claim_mode?: string;
  status?: string;
  day?: number;
  title?: string;
  description: string;
  rewardWater?: number;
  rewardFood?: number;
  deadlineMinutes?: number | null;
  expiresAt?: string | null;
}

function isTaskBoardTask(task: unknown): task is TaskBoardTask {
  return Boolean(
    task &&
      typeof task === "object" &&
      typeof (task as TaskBoardTask).id === "string" &&
      typeof (task as TaskBoardTask).description === "string",
  );
}

function taskClaimMode(task: TaskBoardTask): string {
  return task.claimMode || task.claim_mode || "parallel";
}

function dryRunResponse(task: TaskBoardTask, observations: string[]): string {
  return [
    `Dry-run completion for ${task.id}.`,
    `Task type: ${task.type}.`,
    `Summary: ${task.description}`,
    `Observed context: ${observations.join(" | ") || "none"}.`,
    "This response is intentionally long enough for MVP validators and proves the agent can poll, reason, and submit autonomously.",
  ].join("\n");
}

async function collectToolObservations(task: TaskBoardTask): Promise<string[]> {
  const observations: string[] = [];
  const workspace = listFiles(".");
  if (workspace.success) {
    observations.push(`workspace files: ${workspace.files.slice(0, 12).join(", ") || "empty"}`);
  }

  const feedPaths = new Set<string>(["/market-feed"]);
  if (task.type.includes("data")) feedPaths.add("/surveys");
  if (task.type.includes("research")) feedPaths.add("/competitors");
  if (task.type.includes("bug") || task.type.includes("multi")) feedPaths.add("/deployments");

  for (const path of feedPaths) {
    const result = await fetchGameData(path);
    if (result.success) {
      const preview = typeof result.data === "string"
        ? result.data.slice(0, 400)
        : JSON.stringify(result.data).slice(0, 400);
      observations.push(`${path}: ${preview}`);
    }
  }

  return observations;
}

async function solveTask(task: TaskBoardTask): Promise<string> {
  const observations = await collectToolObservations(task);
  if (process.env.AGENT_DRY_RUN_TASKS === "1") {
    return dryRunResponse(task, observations);
  }

  return reason({
    task: task.description,
    context: [
      `Task ID: ${task.id}`,
      `Title: ${task.title || "Untitled"}`,
      `Type: ${task.type}`,
      `Source: ${task.source || "unknown"}`,
      `Reward: ${task.rewardWater ?? "?"}W / ${task.rewardFood ?? "?"}F`,
      `Deadline: ${task.deadlineMinutes ?? "unknown"} minutes`,
      `Claim mode: ${taskClaimMode(task)}`,
      `Tool observations:\n${observations.join("\n") || "No tool observations available."}`,
    ].join("\n"),
    memories: recallCategory("strategy").map((m) => `${m.key}: ${m.value}`).join("\n"),
    systemPrompt: SYSTEM_PROMPT,
  });
}

export async function sendStatusUpdate(): Promise<void> {
  const memHash = await getMemoryHash();
  const uptimeSeconds = Math.floor(process.uptime());
  await sendAgentMessage({
    tag: "AGENT:STATUS",
    memoryHash: memHash,
    uptimeSeconds,
  });
  writeLocalHeartbeat({
    agentId: getAgentId(),
    uptimeSeconds,
    memoryHash: memHash,
  });
}

export async function attemptTask(task: TaskBoardTask): Promise<boolean> {
  if (task.status && task.status !== "active") return false;
  if (hasTaskHistory(task.id)) return false;

  const agentId = getAgentId();
  logRuntimeEvent({
    agentId,
    event: "task_attempt_started",
    details: { taskId: task.id, type: task.type },
  });

  if (taskClaimMode(task) === "claim_with_timeout") {
    await sendAgentMessage({
      tag: "AGENT:CLAIM",
      taskId: task.id,
    });
    await new Promise((r) => setTimeout(r, 1000));
  }

  const response = await solveTask(task);
  await sendAgentMessage({
    tag: "AGENT:SUBMIT",
    taskId: task.id,
    result: { answer: response },
  });

  const day = task.day ?? Number(recall("current-day") || 0);
  recordTask(task.id, task.type, day, response, true);
  remember(`task-${task.id}`, response.slice(0, 500), "tasks", day);
  logRuntimeEvent({
    agentId,
    event: "task_attempt_submitted",
    details: { taskId: task.id, type: task.type, responseLength: response.length },
  });

  return true;
}

export async function attemptActiveTasksOnce(): Promise<number> {
  const rawTasks = await fetchTasks();
  const limit = Number(process.env.AGENT_MAX_TASKS_PER_POLL || 2);
  let attempts = 0;

  for (const task of rawTasks.filter(isTaskBoardTask)) {
    if (attempts >= limit) break;
    try {
      if (await attemptTask(task)) attempts += 1;
    } catch (err) {
      const agentId = getAgentId();
      logRuntimeEvent({
        agentId,
        level: "error",
        event: "task_attempt_failed",
        details: {
          taskId: task.id,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      console.error(`Task attempt failed for ${task.id}:`, err);
    }
  }

  return attempts;
}

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
  await sendStatusUpdate();
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
  const run = async () => {
    try {
      const attempted = await attemptActiveTasksOnce();
      if (attempted > 0) {
        console.log(`Submitted ${attempted} proactive task attempt(s)`);
      }
    } catch (err) {
      console.error("Proactive loop error:", err);
    }
  };

  void run();
  return setInterval(run, Number(process.env.AGENT_POLL_SECONDS || 300) * 1000);
}
