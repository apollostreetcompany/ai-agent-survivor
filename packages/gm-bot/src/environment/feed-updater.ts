import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const FEED_DIR = process.env.GAME_DATA_DIR || "./game-data-content";

/** Ensure feed directory structure exists */
export function initFeeds() {
  const dirs = ["", "/api", "/market-feed", "/tasks"];
  for (const dir of dirs) {
    const path = join(FEED_DIR, dir);
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
  }
}

/** Update the active tasks feed */
export function updateTaskFeed(tasks: unknown[]): void {
  const apiDir = join(FEED_DIR, "api");
  if (!existsSync(apiDir)) mkdirSync(apiDir, { recursive: true });
  writeFileSync(
    join(FEED_DIR, "api/tasks.json"),
    JSON.stringify(tasks, null, 2),
  );
}

/** Update market data feed */
export function updateMarketFeed(data: unknown): void {
  writeFileSync(
    join(FEED_DIR, "api/market-feed.json"),
    JSON.stringify(data, null, 2),
  );
}

/** Add a research document to the feed */
export function addResearchDocument(id: string, content: unknown): void {
  const docDir = join(FEED_DIR, "api/research");
  if (!existsSync(docDir)) mkdirSync(docDir, { recursive: true });
  writeFileSync(
    join(docDir, `${id}.json`),
    JSON.stringify(content, null, 2),
  );
}

/** Update deployment logs (for incident response tasks) */
export function updateDeploymentLogs(logs: unknown[]): void {
  writeFileSync(
    join(FEED_DIR, "api/deployments.json"),
    JSON.stringify(logs, null, 2),
  );
}

/** Update competitor data (for competitive intelligence tasks) */
export function updateCompetitorData(data: unknown): void {
  writeFileSync(
    join(FEED_DIR, "api/competitors.json"),
    JSON.stringify(data, null, 2),
  );
}

/** Update survey data (for data pipeline tasks) */
export function updateSurveyData(data: unknown): void {
  writeFileSync(
    join(FEED_DIR, "api/surveys.json"),
    JSON.stringify(data, null, 2),
  );
}

/** Write arbitrary data to the feed */
export function writeFeed(path: string, data: unknown): void {
  const fullPath = join(FEED_DIR, path);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, JSON.stringify(data, null, 2));
}
