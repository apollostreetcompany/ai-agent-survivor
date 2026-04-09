import { TaskGenerator } from "./base.js";
import type { TaskDefinition, DifficultyProfile, ResourceDelta } from "@survivor/shared";

interface CalendarScenario {
  title: string;
  existingEvents: Array<{ title: string; time: string; duration: string }>;
  request: string;
  expectedAction: string;
}

const SCENARIOS: Record<string, CalendarScenario[]> = {
  easy: [
    {
      title: "Simple Meeting Schedule",
      existingEvents: [
        { title: "Team standup", time: "9:00 AM", duration: "30 min" },
        { title: "Lunch", time: "12:00 PM", duration: "1 hour" },
        { title: "1:1 with manager", time: "3:00 PM", duration: "30 min" },
      ],
      request: "Schedule a 1-hour code review session today. Prefer morning if available.",
      expectedAction: "schedule_between_standup_and_lunch",
    },
  ],
  medium: [
    {
      title: "Conflict Resolution",
      existingEvents: [
        { title: "Client call (IMPORTANT)", time: "10:00 AM", duration: "1 hour" },
        { title: "Sprint planning", time: "10:30 AM", duration: "1.5 hours" },
        { title: "Design review", time: "2:00 PM", duration: "1 hour" },
        { title: "Interview candidate", time: "2:30 PM", duration: "45 min" },
        { title: "Team retro", time: "4:00 PM", duration: "1 hour" },
      ],
      request: "There are two scheduling conflicts. Resolve them by priority. The client call cannot be moved. The interview has a candidate traveling from out of town and strongly prefers the afternoon. Reschedule what you can and email affected parties about changes.",
      expectedAction: "reschedule_sprint_planning_and_design_review",
    },
  ],
  hard: [
    {
      title: "Cross-Timezone Team Coordination",
      existingEvents: [
        { title: "US-West standup", time: "9:00 AM PST", duration: "30 min" },
        { title: "EU sync", time: "9:00 AM CET", duration: "1 hour" },
        { title: "Asia team review", time: "10:00 AM JST", duration: "45 min" },
        { title: "All-hands", time: "12:00 PM PST", duration: "1 hour" },
        { title: "Customer demo", time: "3:00 PM EST", duration: "1.5 hours" },
      ],
      request: "Find a 1-hour slot where all three timezone teams (US-West/PST, EU/CET, Asia/JST) can meet today. Avoid before 8am or after 8pm local time for any team. If no slot exists, propose the best compromise and explain the trade-offs. Send calendar invites and notification emails to each regional team lead.",
      expectedAction: "find_overlapping_slot_or_propose_compromise",
    },
  ],
};

export class CalendarMgmtTask extends TaskGenerator {
  readonly type = "calendar-mgmt" as const;
  readonly source = "ambient" as const;
  readonly baseReward: ResourceDelta = { water: 12, food: 10 };
  readonly baseDeadlineMinutes = 40;

  generate(day: number, difficulty: DifficultyProfile): TaskDefinition {
    const { reward, deadlineMinutes } = this.scaled(day);
    const tier = difficulty.complexity <= 3 ? "easy" : difficulty.complexity <= 6 ? "medium" : "hard";
    const scenarios = SCENARIOS[tier]!;
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)]!;

    const eventsStr = scenario.existingEvents
      .map((e) => `- ${e.title}: ${e.time} (${e.duration})`)
      .join("\n");

    return {
      id: this.makeId(day),
      type: this.type,
      source: this.source,
      claimMode: "parallel",
      day,
      difficulty: difficulty.complexity,
      title: `Calendar: ${scenario.title}`,
      description: `Manage the following calendar situation.\n\nExisting events:\n${eventsStr}\n\nRequest: ${scenario.request}\n\nTake the necessary actions (update calendar, send emails if needed) and report what you did.`,
      reward,
      deadlineMinutes,
      maxCompletions: 8,
      toolsRequired: ["calendar", "email"],
    };
  }

  async evaluate(submission: unknown): Promise<boolean> {
    if (!submission || typeof submission !== "object") return false;
    const answer = (submission as any).answer;
    return typeof answer === "string" && answer.length > 50;
  }
}
