import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  DEFAULT_PLAYABLE_ROSTER_AGENT_IDS,
  encodeGmMessage,
  parseMessage,
  type AgentId,
  type AgentMessage,
  type GmMessage,
} from "@survivor/shared";
import { handleGmMessage } from "./agent.js";
import {
  clearAgentMessageTransport,
  configureAgentMessageTransport,
} from "./discord-handler.js";

export const LOCAL_ROSTER_AGENT_IDS = DEFAULT_PLAYABLE_ROSTER_AGENT_IDS;

export const LOCAL_CANARY_INPUT = "survivor";
export const LOCAL_CANARY_ID = "local-canary-survivor-sha256";

export interface LocalProtocolSmokeOptions {
  agentId?: string;
  gmMessage?: string | GmMessage;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export interface LocalRunnerIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

function validRosterIds(): string {
  return LOCAL_ROSTER_AGENT_IDS.join(", ");
}

export function assertLocalRosterAgentId(agentId: string | undefined): AgentId {
  if (!agentId) {
    throw new Error(
      `AGENT_ID is required for local agent runner. Set AGENT_ID or pass --agent-id. Expected one of: ${validRosterIds()}.`,
    );
  }

  if (!(LOCAL_ROSTER_AGENT_IDS as readonly string[]).includes(agentId)) {
    throw new Error(`Invalid AGENT_ID "${agentId}". Expected one of: ${validRosterIds()}.`);
  }

  return agentId;
}

function isGmMessage(message: GmMessage | AgentMessage | null): message is GmMessage {
  return Boolean(message?.tag.startsWith("GM:"));
}

export function createLocalCanaryMessage(): GmMessage {
  return {
    tag: "GM:CANARY",
    id: LOCAL_CANARY_ID,
    prompt: `Compute SHA-256('${LOCAL_CANARY_INPUT}') and respond with only the hex digest.`,
    deadlineSeconds: 30,
  };
}

export function expectedLocalCanaryResponse(): string {
  return createHash("sha256").update(LOCAL_CANARY_INPUT).digest("hex");
}

export function parseGmProtocolMessage(raw: string): GmMessage {
  const parsed = parseMessage(raw);
  if (!parsed) {
    throw new Error("Invalid GM protocol message. Expected `[GM:<TYPE>] {json}`.");
  }
  if (!isGmMessage(parsed)) {
    throw new Error(`Expected a GM protocol message, got ${parsed.tag}.`);
  }

  return parsed;
}

function resolveGmMessage(input: string | GmMessage | undefined): GmMessage {
  if (!input) return createLocalCanaryMessage();
  if (typeof input === "string") return parseGmProtocolMessage(input);
  return input;
}

async function withHandlerLogsOnStderr<T>(
  stderr: ((line: string) => void) | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    if (stderr) stderr(args.map(String).join(" "));
  };

  try {
    return await fn();
  } finally {
    console.log = originalLog;
  }
}

export async function runLocalProtocolSmoke(
  options: LocalProtocolSmokeOptions = {},
): Promise<string[]> {
  const agentId = assertLocalRosterAgentId(options.agentId);
  const gmMessage = resolveGmMessage(options.gmMessage);
  const emittedMessages: string[] = [];

  configureAgentMessageTransport(agentId, (encodedMessage) => {
    emittedMessages.push(encodedMessage);
    options.stdout?.(encodedMessage);
  });

  try {
    await withHandlerLogsOnStderr(options.stderr, async () => {
      await handleGmMessage(gmMessage);
    });
  } finally {
    clearAgentMessageTransport();
  }

  if (emittedMessages.length === 0) {
    throw new Error(`Local agent runner handled ${gmMessage.tag} but emitted no agent protocol messages.`);
  }

  return emittedMessages;
}

function readOption(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(name);
  if (index !== -1) return args[index + 1];

  return undefined;
}

export async function runLocalRunnerCommand(
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  io: LocalRunnerIo = {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  },
): Promise<number> {
  const command = args[0]?.startsWith("--") ? "smoke" : args[0] ?? "smoke";

  if (command === "help" || command === "--help" || command === "-h") {
    io.stdout("Usage: AGENT_ID=agent-alpha bun --filter @survivor/agent-template local:smoke");
    io.stdout("       bun --filter @survivor/agent-template local:smoke -- --agent-id agent-alpha");
    return 0;
  }

  if (command !== "smoke") {
    io.stderr(`Unknown local runner command "${command}". Expected "smoke".`);
    return 1;
  }

  try {
    const agentId = readOption(args, "--agent-id") ?? env.AGENT_ID;
    const gmMessage =
      readOption(args, "--gm-message") ?? encodeGmMessage(createLocalCanaryMessage());

    await runLocalProtocolSmoke({
      agentId,
      gmMessage,
      stdout: io.stdout,
    });
    return 0;
  } catch (err) {
    io.stderr(`Local agent runner failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

const isDirectRun = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  const exitCode = await runLocalRunnerCommand();
  process.exit(exitCode);
}
