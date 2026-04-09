import { TaskGenerator } from "./base.js";
import type { TaskDefinition, DifficultyProfile, ResourceDelta } from "@survivor/shared";

interface ContentBrief {
  title: string;
  brief: string;
  format: string;
  constraints: string[];
  wordCount: { min: number; max: number };
}

const BRIEFS: Record<string, ContentBrief[]> = {
  easy: [
    {
      title: "Product Description",
      brief: "Write a product description for 'AquaPure X1' — a portable water filtration bottle that uses UV-C light to purify water in 60 seconds. Target audience: outdoor enthusiasts.",
      format: "Marketing copy",
      constraints: ["Include 3 key features with benefits", "End with a call to action"],
      wordCount: { min: 100, max: 200 },
    },
    {
      title: "Social Media Thread",
      brief: "Write a 5-post Twitter/X thread explaining why AI agents are the future of productivity. Tone: enthusiastic but credible. Each post max 280 characters.",
      format: "Social media thread (5 posts)",
      constraints: ["Each post under 280 chars", "Include relevant hashtags", "Thread must have a narrative arc"],
      wordCount: { min: 100, max: 400 },
    },
  ],
  medium: [
    {
      title: "Technical Blog Post",
      brief: "Write a blog post titled 'Building Resilient AI Agents: Lessons from Production'. Cover: memory management pitfalls, error recovery patterns, and the importance of graceful degradation.",
      format: "Technical blog post with code examples",
      constraints: [
        "Include at least 2 code snippets (Python or JS)",
        "Write for a developer audience",
        "Include a TL;DR at the top",
        "Structured with clear headers",
      ],
      wordCount: { min: 400, max: 800 },
    },
  ],
  hard: [
    {
      title: "Whitepaper Draft",
      brief: "Draft the executive summary and methodology sections of a whitepaper titled 'Autonomous Agent Benchmarking: A Framework for Evaluating Real-World AI Capability'. The paper proposes a standardized benchmark for AI agents based on survival mechanics, resource management, and tool-use proficiency.",
      format: "Academic whitepaper sections",
      constraints: [
        "Executive summary: 200-300 words",
        "Methodology: 400-600 words describing the evaluation framework",
        "Include a comparison table with existing benchmarks (GAIA, WebArena, SWE-bench)",
        "Cite realistic considerations (not fabricated references)",
        "Professional academic tone",
      ],
      wordCount: { min: 600, max: 1000 },
    },
  ],
};

export class ContentGenTask extends TaskGenerator {
  readonly type = "content-gen" as const;
  readonly source = "urgent" as const;
  readonly baseReward: ResourceDelta = { water: 14, food: 12 };
  readonly baseDeadlineMinutes = 35;

  generate(day: number, difficulty: DifficultyProfile): TaskDefinition {
    const { reward, deadlineMinutes } = this.scaled(day);
    const tier = difficulty.complexity <= 3 ? "easy" : difficulty.complexity <= 7 ? "medium" : "hard";
    const briefs = BRIEFS[tier]!;
    const brief = briefs[Math.floor(Math.random() * briefs.length)]!;

    const constraintsStr = brief.constraints.map((c) => `- ${c}`).join("\n");

    return {
      id: this.makeId(day),
      type: this.type,
      source: this.source,
      claimMode: "parallel",
      day,
      difficulty: difficulty.complexity,
      title: `Content: ${brief.title}`,
      description: `Create content matching this brief:\n\n${brief.brief}\n\nFormat: ${brief.format}\nWord count: ${brief.wordCount.min}-${brief.wordCount.max} words\n\nConstraints:\n${constraintsStr}\n\nSubmit the final content ready for publication.`,
      reward,
      deadlineMinutes,
      maxCompletions: 8,
    };
  }

  async evaluate(submission: unknown): Promise<boolean> {
    if (!submission || typeof submission !== "object") return false;
    const answer = (submission as any).answer;
    return typeof answer === "string" && answer.length > 80;
  }
}
