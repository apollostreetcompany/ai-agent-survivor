import { TaskGenerator } from "./base.js";
import type { TaskDefinition, DifficultyProfile, ResourceDelta } from "@survivor/shared";

interface MultiStepWorkflow {
  title: string;
  scenario: string;
  steps: string[];
  deliverables: string[];
}

const WORKFLOWS: Record<string, MultiStepWorkflow[]> = {
  medium: [
    {
      title: "Incident Response Pipeline",
      scenario: "The monitoring system detected an anomaly in production. You are the on-call engineer.",
      steps: [
        "Parse the alert data (provided as JSON) and identify the affected service",
        "Query the game-data API for recent deployment logs at /api/deployments",
        "Cross-reference the alert timestamp with deployment timestamps to identify the likely cause",
        "Write a Python script that analyzes the error patterns and outputs a severity classification",
        "Draft an incident report email to the team summarizing findings and next steps",
      ],
      deliverables: [
        "Identified service and root cause",
        "Python analysis script (working code)",
        "Incident report email (ready to send)",
      ],
    },
  ],
  hard: [
    {
      title: "Full-Stack Data Pipeline",
      scenario: "Build a data pipeline that processes raw survey data, cleans it, analyzes it, and produces a report.",
      steps: [
        "Fetch raw survey data from game-data.local/api/surveys (JSON)",
        "Write a Python script to clean the data: remove duplicates, handle missing values, normalize text fields",
        "Run statistical analysis: compute averages, medians, standard deviations, and identify outliers",
        "Generate a summary visualization description (text-based chart data since you can't render images)",
        "Write findings into a structured report",
        "Email the report to gm@survivor.local with the analysis script attached as inline code",
        "Update your calendar with a follow-up review meeting for 48 hours from now",
      ],
      deliverables: [
        "Cleaned dataset (describe transformations applied)",
        "Statistical analysis results with methodology",
        "Working Python analysis script",
        "Structured report",
        "Confirmation of email sent and calendar event created",
      ],
    },
    {
      title: "Competitive Intelligence Briefing",
      scenario: "Your CEO needs a competitive analysis before a board meeting in 2 hours.",
      steps: [
        "Fetch competitor data from game-data.local/api/competitors (JSON profiles of 5 companies)",
        "For each competitor, analyze: market position, recent product launches, pricing strategy",
        "Cross-reference with market trend data from game-data.local/api/market-trends",
        "Write a SWOT analysis for your company based on the competitive landscape",
        "Create an executive briefing email (max 500 words, actionable recommendations)",
        "Schedule a prep meeting on the calendar 30 minutes before the board meeting",
        "Store key competitive insights in your memory for future reference",
      ],
      deliverables: [
        "Individual competitor analyses",
        "SWOT analysis",
        "Executive briefing email (sent to ceo@survivor.local)",
        "Calendar event confirmation",
        "Memory storage confirmation",
      ],
    },
  ],
};

export class MultiStepTask extends TaskGenerator {
  readonly type = "multi-step" as const;
  readonly source = "urgent" as const;
  readonly baseReward: ResourceDelta = { water: 30, food: 25 };
  readonly baseDeadlineMinutes = 60;

  generate(day: number, difficulty: DifficultyProfile): TaskDefinition {
    const { reward, deadlineMinutes } = this.scaled(day);
    const tier = difficulty.toolChaining <= 4 ? "medium" : "hard";
    const workflows = WORKFLOWS[tier]!;
    const workflow = workflows[Math.floor(Math.random() * workflows.length)]!;

    const stepsStr = workflow.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
    const deliverablesStr = workflow.deliverables.map((d) => `- ${d}`).join("\n");

    return {
      id: this.makeId(day),
      type: this.type,
      source: this.source,
      claimMode: "claim_with_timeout",
      day,
      difficulty: difficulty.complexity,
      title: workflow.title,
      description: `${workflow.scenario}\n\nComplete the following multi-step workflow:\n\n${stepsStr}\n\nRequired deliverables:\n${deliverablesStr}\n\nYou must use multiple tools (code execution, email, calendar, game data API) to complete this task. Show your work for each step.`,
      reward,
      penalty: { water: -8, food: -5 },
      deadlineMinutes,
      claimTimeoutMinutes: deadlineMinutes,
      toolsRequired: ["code-runner", "email", "calendar", "http"],
    };
  }

  async evaluate(submission: unknown): Promise<boolean> {
    if (!submission || typeof submission !== "object") return false;
    const answer = (submission as any).answer;
    // Multi-step tasks need substantial responses showing work for each step
    return typeof answer === "string" && answer.length > 300;
  }
}
