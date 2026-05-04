import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const infraRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(infraRoot, "../..");
const composePath = resolve(infraRoot, "docker-compose.yml");
const gameDataNginxPath = resolve(infraRoot, "game-data-nginx.conf");
const agentDockerfilePath = resolve(repoRoot, "packages/agent-template/Dockerfile");
const gmDockerfilePath = resolve(repoRoot, "packages/gm-bot/Dockerfile");
const sharedDefaultRosterPath = resolve(repoRoot, "packages/shared/src/default-roster.json");

function read(path) {
  return readFileSync(path, "utf8");
}

function defaultRosterAgentIds() {
  const roster = JSON.parse(read(sharedDefaultRosterPath));
  return roster.map((agent) => agent.id);
}

function topLevelSection(source, name) {
  const header = `${name}:\n`;
  const start = source.search(new RegExp(`^${name}:\\n`, "m"));
  if (start === -1) return "";

  const rest = source.slice(start + header.length);
  const nextTopLevel = rest.search(/^\S/m);
  return nextTopLevel === -1 ? rest : rest.slice(0, nextTopLevel);
}

function serviceBlock(servicesSection, name) {
  const header = `  ${name}:\n`;
  const start = servicesSection.search(new RegExp(`^  ${name}:\\n`, "m"));
  if (start === -1) return "";

  const rest = servicesSection.slice(start + header.length);
  const nextService = rest.search(/^  [a-zA-Z0-9_-]+:/m);
  return nextService === -1 ? rest : rest.slice(0, nextService);
}

test("compose defines the four local roster agents with exactly one AGENT_ID each", () => {
  const compose = read(composePath);
  const services = topLevelSection(compose, "services");
  const rosterAgentIds = defaultRosterAgentIds();
  const serviceNames = [...services.matchAll(/^  (agent-[a-z]+):\s*$/gm)].map((match) => match[1]);

  assert.deepEqual(serviceNames.sort(), [...rosterAgentIds].sort());

  const agentIdValues = [...services.matchAll(/AGENT_ID:\s*(agent-[a-z]+)/g)].map((match) => match[1]);
  assert.deepEqual(agentIdValues.sort(), [...rosterAgentIds].sort());

  for (const agentId of rosterAgentIds) {
    assert.equal(
      agentIdValues.filter((value) => value === agentId).length,
      1,
      `${agentId} must be assigned exactly once`,
    );

    const block = serviceBlock(services, agentId);
    assert.match(block, /build:\n\s+context:\s+\.\.\/\.\./);
    assert.match(block, /dockerfile:\s+packages\/agent-template\/Dockerfile/);
    assert.match(block, new RegExp(`AGENT_ID:\\s*${agentId}\\b`));
  }
});

test("agent-template Dockerfile builds from the monorepo and copies its entrypoint", () => {
  const dockerfile = read(agentDockerfilePath);

  assert.match(dockerfile, /COPY\s+package\.json\s+bun\.lock\s+\.\//);
  assert.match(dockerfile, /COPY\s+packages\/shared\/package\.json\s+\.\/packages\/shared\/package\.json/);
  assert.match(dockerfile, /COPY\s+packages\/agent-template\/package\.json\s+\.\/packages\/agent-template\/package\.json/);
  assert.match(dockerfile, /COPY\s+packages\/shared\/src\s+\.\/packages\/shared\/src/);
  assert.match(dockerfile, /COPY\s+packages\/agent-template\/src\s+\.\/packages\/agent-template\/src/);
  assert.match(dockerfile, /COPY\s+packages\/agent-template\/entrypoint\.sh\s+\.\/entrypoint\.sh/);
  assert.match(dockerfile, /chmod\s+\+x\s+\.\/entrypoint\.sh/);
  assert.match(dockerfile, /ENTRYPOINT\s+\["\.\/entrypoint\.sh"\]/);
});

test("gm-bot compose image has a Dockerfile that includes the shared workspace package", () => {
  assert.equal(existsSync(gmDockerfilePath), true, "packages/gm-bot/Dockerfile is required by compose");

  const dockerfile = read(gmDockerfilePath);
  assert.match(dockerfile, /COPY\s+package\.json\s+bun\.lock\s+\.\//);
  assert.match(dockerfile, /COPY\s+packages\/shared\/package\.json\s+\.\/packages\/shared\/package\.json/);
  assert.match(dockerfile, /COPY\s+packages\/gm-bot\/package\.json\s+\.\/packages\/gm-bot\/package\.json/);
  assert.match(dockerfile, /COPY\s+packages\/shared\/src\s+\.\/packages\/shared\/src/);
  assert.match(dockerfile, /COPY\s+packages\/gm-bot\/src\s+\.\/packages\/gm-bot\/src/);
});

test("gm-bot receives Discord bot IDs for live agent identity checks", () => {
  const compose = read(composePath);
  const services = topLevelSection(compose, "services");
  const gmBlock = serviceBlock(services, "gm-bot");

  assert.match(gmBlock, /AGENT_ALPHA_DISCORD_BOT_ID:\s+\$\{AGENT_ALPHA_DISCORD_BOT_ID:-\}/);
  assert.match(gmBlock, /AGENT_BRAVO_DISCORD_BOT_ID:\s+\$\{AGENT_BRAVO_DISCORD_BOT_ID:-\}/);
  assert.match(gmBlock, /AGENT_CHARLIE_DISCORD_BOT_ID:\s+\$\{AGENT_CHARLIE_DISCORD_BOT_ID:-\}/);
  assert.match(gmBlock, /AGENT_DELTA_DISCORD_BOT_ID:\s+\$\{AGENT_DELTA_DISCORD_BOT_ID:-\}/);
});

test("game-data service routes agent API paths to GM-written feed files", () => {
  const compose = read(composePath);
  const services = topLevelSection(compose, "services");
  const gameDataBlock = serviceBlock(services, "game-data");
  const nginxConfig = read(gameDataNginxPath);

  assert.match(gameDataBlock, /image:\s+nginx:alpine/);
  assert.match(
    gameDataBlock,
    /\.\/game-data-nginx\.conf:\/etc\/nginx\/conf\.d\/default\.conf:ro/,
  );
  assert.match(nginxConfig, /location = \/tasks/);
  assert.match(nginxConfig, /try_files \/api\/tasks\.json =404/);
  assert.match(nginxConfig, /location = \/market-feed/);
  assert.match(nginxConfig, /try_files \/api\/market-feed\.json =404/);
});
