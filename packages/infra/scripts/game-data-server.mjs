import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

const root = process.env.GAME_DATA_DIR || "./game-data-content";
const port = Number(process.env.GAME_DATA_PORT || 8787);
const healthFile = process.env.SURVIVOR_HEALTH_FILE;

const routes = new Map([
  ["/tasks", "api/tasks.json"],
  ["/market-feed", "api/market-feed.json"],
]);

function json(status, body) {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function resolvePath(urlPath) {
  const mapped = routes.get(urlPath) || urlPath.replace(/^\/+/, "");
  const normalized = normalize(mapped);
  if (normalized.startsWith("..")) return null;
  return join(root, normalized);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const filePath = resolvePath(url.pathname);
  if (!filePath) {
    const response = json(403, { error: "forbidden" });
    res.writeHead(response.status, response.headers);
    res.end(response.body);
    return;
  }

  try {
    const body = await readFile(filePath, "utf8");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  } catch {
    const fallback = url.pathname === "/tasks" ? [] : { error: "not found" };
    const response = json(url.pathname === "/tasks" ? 200 : 404, fallback);
    res.writeHead(response.status, response.headers);
    res.end(response.body);
  }
});

async function writeHeartbeat() {
  if (!healthFile) return;
  await mkdir(dirname(healthFile), { recursive: true });
  await writeFile(healthFile, `${JSON.stringify({
    processType: "game-data",
    processId: "game-data",
    status: "ok",
    root,
    port,
    recordedAt: new Date().toISOString(),
  })}\n`);
}

server.listen(port, "127.0.0.1", () => {
  console.log(`game-data server listening on http://127.0.0.1:${port} root=${root}`);
  writeHeartbeat().catch((err) => console.error("game-data heartbeat failed:", err));
});

const heartbeatTimer = setInterval(() => {
  writeHeartbeat().catch((err) => console.error("game-data heartbeat failed:", err));
}, 60_000);

process.on("SIGTERM", () => server.close(() => {
  clearInterval(heartbeatTimer);
  process.exit(0);
}));
process.on("SIGINT", () => server.close(() => {
  clearInterval(heartbeatTimer);
  process.exit(0);
}));
