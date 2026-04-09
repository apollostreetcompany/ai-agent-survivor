import { TaskGenerator } from "./base.js";
import type { TaskDefinition, DifficultyProfile, ResourceDelta } from "@survivor/shared";

interface ResearchBrief {
  topic: string;
  documents: Array<{ title: string; abstract: string; key_findings: string }>;
  deliverable: string;
}

const RESEARCH_TOPICS: Record<string, ResearchBrief[]> = {
  easy: [
    {
      topic: "Battery Technology Trends",
      documents: [
        {
          title: "Solid-State Batteries: 2026 Progress Report",
          abstract: "This report summarizes advances in solid-state lithium batteries, including new sulfide electrolytes achieving 5mS/cm ionic conductivity at room temperature.",
          key_findings: "Energy density improved 40% over liquid lithium-ion. Manufacturing costs remain 3x higher. Toyota and Samsung SDI have pilot lines running.",
        },
        {
          title: "Sodium-Ion Batteries for Grid Storage",
          abstract: "Sodium-ion batteries offer lower cost per kWh for stationary storage. This paper reviews deployments in China and Australia.",
          key_findings: "Cost per kWh is $45 vs $95 for lithium-ion at grid scale. Cycle life is 4000+ cycles. Energy density 30% lower than lithium-ion.",
        },
      ],
      deliverable: "Write a 200-word executive summary comparing solid-state and sodium-ion battery technologies for a venture capital audience.",
    },
  ],
  medium: [
    {
      topic: "AI Agent Security Vulnerabilities",
      documents: [
        {
          title: "Prompt Injection Attacks on Autonomous Agents",
          abstract: "We catalog 47 distinct prompt injection attack vectors targeting LLM-based autonomous agents with tool access.",
          key_findings: "Indirect injection via retrieved documents is the most common vector (68%). Tool-use agents are 3.2x more vulnerable than chat-only systems. Defense layers (input sanitization, output filtering, capability bounding) reduce attack surface by 85%.",
        },
        {
          title: "Memory Poisoning in Persistent Agents",
          abstract: "Long-running agents that persist memory across sessions are vulnerable to memory poisoning attacks.",
          key_findings: "Adversarial inputs stored in memory can activate days later. TTL-based memory expiration reduces risk but also reduces agent capability. Cryptographic memory signing is proposed but adds 15% latency overhead.",
        },
        {
          title: "Multi-Agent Coordination Failures",
          abstract: "When multiple agents share resources or communicate, new attack surfaces emerge.",
          key_findings: "Agent impersonation, message replay, and resource starvation attacks are demonstrated. Mutual authentication between agents reduces impersonation by 95%. No existing framework implements it by default.",
        },
      ],
      deliverable: "Write a threat model document (300 words) for a company deploying autonomous AI agents. Prioritize the top 3 risks and recommend specific mitigations for each.",
    },
  ],
  hard: [
    {
      topic: "Cross-Domain Synthesis: Climate + Supply Chain + AI",
      documents: [
        {
          title: "Climate Disruption to Pacific Shipping Routes",
          abstract: "Increased typhoon frequency and intensity is disrupting trans-Pacific shipping.",
          key_findings: "Average delay per container increased from 3 to 11 days. Insurance costs up 40%. Alternative Arctic routes are opening but have limited capacity and environmental concerns.",
        },
        {
          title: "AI-Driven Supply Chain Optimization",
          abstract: "Machine learning models for dynamic rerouting and inventory optimization.",
          key_findings: "Reinforcement learning models reduce stockout risk by 35% in simulated disruptions. Real-world deployment requires integration with legacy ERP systems. Training data from past disruptions may not predict novel climate patterns.",
        },
        {
          title: "Semiconductor Supply Concentration Risks",
          abstract: "90% of advanced semiconductors are produced in Taiwan and South Korea.",
          key_findings: "Geopolitical tensions and climate risks (water scarcity for fab operations) create compound risk. US CHIPS Act is funding domestic production but won't reach scale until 2028. Current AI chip shortage affects agent deployment.",
        },
      ],
      deliverable: "Write a 500-word strategic brief connecting climate disruption, supply chain vulnerability, and AI deployment constraints. Identify non-obvious second-order effects and recommend a hedging strategy. Reference specific data from all three documents.",
    },
  ],
};

export class ResearchTask extends TaskGenerator {
  readonly type = "research" as const;
  readonly source = "ambient" as const;
  readonly baseReward: ResourceDelta = { water: 18, food: 15 };
  readonly baseDeadlineMinutes = 60;

  generate(day: number, difficulty: DifficultyProfile): TaskDefinition {
    const { reward, deadlineMinutes } = this.scaled(day);
    const tier = difficulty.complexity <= 3 ? "easy" : difficulty.complexity <= 6 ? "medium" : "hard";
    const briefs = RESEARCH_TOPICS[tier]!;
    const brief = briefs[Math.floor(Math.random() * briefs.length)]!;

    const docsStr = brief.documents
      .map(
        (d, i) =>
          `--- Document ${i + 1}: "${d.title}" ---\nAbstract: ${d.abstract}\nKey Findings: ${d.key_findings}`,
      )
      .join("\n\n");

    return {
      id: this.makeId(day),
      type: this.type,
      source: this.source,
      claimMode: "parallel",
      day,
      difficulty: difficulty.complexity,
      title: `Research: ${brief.topic}`,
      description: `You are a research analyst. Synthesize the following documents and produce the requested deliverable.\n\n${docsStr}\n\nDeliverable: ${brief.deliverable}`,
      reward,
      deadlineMinutes,
      maxCompletions: 8,
    };
  }

  async evaluate(submission: unknown): Promise<boolean> {
    if (!submission || typeof submission !== "object") return false;
    const answer = (submission as any).answer;
    return typeof answer === "string" && answer.length > 150;
  }
}
