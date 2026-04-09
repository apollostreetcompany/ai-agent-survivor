import { TaskGenerator } from "./base.js";
import type { TaskDefinition, DifficultyProfile, ResourceDelta } from "@survivor/shared";

const EMAIL_SCENARIOS = {
  easy: [
    {
      from: "boss@survivor.local",
      subject: "Meeting reschedule",
      body: "Can you move our 3pm to 4pm tomorrow? I have a conflict.",
      expectedAction: "reply_confirm_reschedule",
    },
    {
      from: "team@survivor.local",
      subject: "Weekly report needed",
      body: "Please send the Q2 metrics summary by end of day.",
      expectedAction: "reply_with_summary",
    },
  ],
  medium: [
    {
      from: "client@survivor.local",
      subject: "RE: Project delays",
      body: "We're concerned about the timeline. The deliverables were due last week. Can you provide an updated ETA and explain what caused the delay? We need this for our board meeting.",
      expectedAction: "reply_with_eta_and_explanation",
    },
    {
      from: "hr@survivor.local",
      subject: "Policy update - action required",
      body: "New remote work policy attached. Please review, acknowledge, and submit your updated work schedule by Friday. Also forward to your direct reports.",
      expectedAction: "reply_acknowledge_and_forward",
    },
  ],
  hard: [
    {
      from: "ceo@survivor.local",
      subject: "Urgent: Customer escalation",
      body: "Our largest customer is threatening to leave. They sent 3 emails this week that went unanswered. Find those emails in the thread below, draft responses to each, prioritize by urgency, and CC me on all replies. Thread:\n\nEmail 1: 'Why is the API returning 500 errors?'\nEmail 2: 'Our contract renewal is next month and we need to discuss pricing.'\nEmail 3: 'The dashboard data doesn't match our internal numbers.'",
      expectedAction: "draft_three_prioritized_responses",
    },
  ],
};

export class EmailTriageTask extends TaskGenerator {
  readonly type = "email-triage" as const;
  readonly source = "ambient" as const;
  readonly baseReward: ResourceDelta = { water: 12, food: 10 };
  readonly baseDeadlineMinutes = 45;

  generate(day: number, difficulty: DifficultyProfile): TaskDefinition {
    const { reward, deadlineMinutes } = this.scaled(day);
    const tier = difficulty.complexity <= 3 ? "easy" : difficulty.complexity <= 6 ? "medium" : "hard";
    const scenarios = EMAIL_SCENARIOS[tier];
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)]!;

    return {
      id: this.makeId(day),
      type: this.type,
      source: this.source,
      claimMode: "parallel",
      day,
      difficulty: difficulty.complexity,
      title: `Email: ${scenario.subject}`,
      description: `You have received an email from ${scenario.from} with subject "${scenario.subject}". Read it, understand the request, and respond appropriately.\n\nEmail body:\n${scenario.body}`,
      reward,
      deadlineMinutes,
      maxCompletions: 8,
      toolsRequired: ["email"],
    };
  }

  async evaluate(submission: unknown): Promise<boolean> {
    // Basic validation: response must be a non-empty string
    if (!submission || typeof submission !== "object") return false;
    const answer = (submission as any).answer;
    return typeof answer === "string" && answer.length > 20;
  }
}
