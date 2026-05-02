import type { AgentId } from "@survivor/shared";
import { sendText } from "../discord/client.js";
import { CHANNELS } from "@survivor/shared";
import { db, schema } from "../db/index.js";

interface TimingRecord {
  agentId: AgentId;
  eventType: string;
  issuedAt: number;
  respondedAt: number;
  latencyMs: number;
}

const records: TimingRecord[] = [];
const agentProfiles: Map<AgentId, { mean: number; stdDev: number; count: number }> = new Map();

/** Record a timing event */
export function recordTiming(
  agentId: AgentId,
  eventType: string,
  issuedAt: number,
  respondedAt: number,
): void {
  const latencyMs = respondedAt - issuedAt;
  records.push({ agentId, eventType, issuedAt, respondedAt, latencyMs });
  try {
    db.insert(schema.timingRecords)
      .values({
        agentId,
        eventType,
        issuedAt: new Date(issuedAt).toISOString(),
        respondedAt: new Date(respondedAt).toISOString(),
        latencyMs,
      })
      .run();
  } catch (err) {
    console.error("Timing persistence failed:", err);
  }

  // Update agent profile
  updateProfile(agentId);
}

/** Update the statistical profile for an agent */
function updateProfile(agentId: AgentId): void {
  const agentRecords = records.filter((r) => r.agentId === agentId);
  if (agentRecords.length < 3) return;

  const latencies = agentRecords.map((r) => r.latencyMs);
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const variance = latencies.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / latencies.length;
  const stdDev = Math.sqrt(variance);

  agentProfiles.set(agentId, { mean, stdDev, count: agentRecords.length });
}

/** Check if a response latency is anomalous for an agent */
export function isAnomalous(agentId: AgentId, latencyMs: number): boolean {
  const profile = agentProfiles.get(agentId);
  if (!profile || profile.count < 5) return false;

  // Flag if more than 3 standard deviations from mean
  const zScore = Math.abs(latencyMs - profile.mean) / profile.stdDev;
  return zScore > 3;
}

/** Get timing report for all agents */
export function getTimingReport(): string {
  hydrateProfilesFromDb();
  const lines: string[] = ["**Timing Analysis Report**", ""];

  for (const [agentId, profile] of agentProfiles) {
    const recentRecords = records
      .filter((r) => r.agentId === agentId)
      .slice(-10);

    const anomalies = recentRecords.filter((r) => isAnomalous(agentId, r.latencyMs));

    lines.push(
      `**${agentId}**: avg=${Math.round(profile.mean)}ms, ` +
      `stddev=${Math.round(profile.stdDev)}ms, ` +
      `samples=${profile.count}, ` +
      `recent_anomalies=${anomalies.length}`,
    );
  }

  return lines.join("\n");
}

function hydrateProfilesFromDb(): void {
  try {
    const persisted = db.select().from(schema.timingRecords).all();
    if (persisted.length === 0) return;

    records.length = 0;
    for (const record of persisted) {
      records.push({
        agentId: record.agentId,
        eventType: record.eventType,
        issuedAt: new Date(record.issuedAt).getTime(),
        respondedAt: new Date(record.respondedAt).getTime(),
        latencyMs: record.latencyMs,
      });
    }

    agentProfiles.clear();
    for (const agentId of new Set(records.map((record) => record.agentId))) {
      updateProfile(agentId);
    }
  } catch (err) {
    console.error("Timing hydration failed:", err);
  }
}

/** Post timing report to integrity log */
export async function postTimingReport(): Promise<void> {
  const report = getTimingReport();
  if (report.includes("**") && agentProfiles.size > 0) {
    await sendText(CHANNELS.INTEGRITY_LOG, report);
  }
}

/** Detect potential human-intervention patterns */
export function detectPatterns(agentId: AgentId): string[] {
  const agentRecords = records.filter((r) => r.agentId === agentId);
  if (agentRecords.length < 10) return [];

  const flags: string[] = [];

  // Check for business-hours correlation
  const hourCounts = new Array(24).fill(0);
  for (const record of agentRecords) {
    const hour = new Date(record.respondedAt).getUTCHours();
    hourCounts[hour]++;
  }
  const maxHour = hourCounts.indexOf(Math.max(...hourCounts));
  const minHour = hourCounts.indexOf(Math.min(...hourCounts));

  // If there's a strong gap (e.g., no responses during nighttime hours),
  // it might indicate a human operator
  const activeHours = hourCounts.filter((c) => c > 0).length;
  if (activeHours < 16) {
    flags.push(`Only active during ${activeHours}/24 hours — possible human schedule`);
  }

  // Check for suspiciously round response times
  const roundTimes = agentRecords.filter(
    (r) => r.latencyMs % 1000 < 50 || r.latencyMs % 1000 > 950,
  );
  if (roundTimes.length > agentRecords.length * 0.3) {
    flags.push(`${Math.round((roundTimes.length / agentRecords.length) * 100)}% of responses have suspiciously round latencies`);
  }

  return flags;
}
