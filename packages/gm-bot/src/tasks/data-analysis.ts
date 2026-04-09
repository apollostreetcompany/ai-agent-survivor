import { TaskGenerator } from "./base.js";
import type { TaskDefinition, DifficultyProfile, ResourceDelta } from "@survivor/shared";

interface DataSet {
  name: string;
  description: string;
  data: string; // CSV or JSON string
  questions: string[];
}

function generateSalesData(rows: number): string {
  const regions = ["North", "South", "East", "West"];
  const products = ["Widget A", "Widget B", "Gadget X", "Gadget Y"];
  const lines = ["date,region,product,units,revenue,cost"];

  const baseDate = new Date("2026-01-01");
  for (let i = 0; i < rows; i++) {
    const date = new Date(baseDate.getTime() + i * 86400000 * (365 / rows));
    const region = regions[Math.floor(Math.random() * regions.length)]!;
    const product = products[Math.floor(Math.random() * products.length)]!;
    const units = Math.floor(10 + Math.random() * 200);
    const unitPrice = 15 + Math.random() * 85;
    const revenue = Math.round(units * unitPrice * 100) / 100;
    const cost = Math.round(revenue * (0.4 + Math.random() * 0.3) * 100) / 100;
    lines.push(`${date.toISOString().split("T")[0]},${region},${product},${units},${revenue},${cost}`);
  }
  return lines.join("\n");
}

function generateServerLogs(entries: number): string {
  const endpoints = ["/api/users", "/api/orders", "/api/products", "/api/auth", "/api/search"];
  const statuses = [200, 200, 200, 200, 200, 201, 301, 400, 404, 500, 503];
  const lines = ["timestamp,endpoint,method,status,response_ms,user_agent"];

  const baseDate = new Date("2026-04-01");
  for (let i = 0; i < entries; i++) {
    const ts = new Date(baseDate.getTime() + Math.random() * 7 * 86400000);
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)]!;
    const method = endpoint === "/api/auth" ? "POST" : Math.random() > 0.7 ? "POST" : "GET";
    const status = statuses[Math.floor(Math.random() * statuses.length)]!;
    const responseMs = status >= 500 ? 2000 + Math.random() * 8000 : 10 + Math.random() * 500;
    const ua = Math.random() > 0.3 ? "AgentBot/1.0" : "Mozilla/5.0";
    lines.push(`${ts.toISOString()},${endpoint},${method},${status},${Math.round(responseMs)},${ua}`);
  }
  return lines.join("\n");
}

const DATASETS: Record<string, () => DataSet> = {
  easy: () => ({
    name: "Q1 Sales Report",
    description: "Quarterly sales data across regions and products",
    data: generateSalesData(50),
    questions: [
      "What is the total revenue?",
      "Which region has the highest revenue?",
      "What is the profit margin (revenue - cost) / revenue as a percentage?",
    ],
  }),
  medium: () => ({
    name: "Server Access Logs",
    description: "7 days of API server logs",
    data: generateServerLogs(200),
    questions: [
      "What is the error rate (4xx + 5xx responses as a percentage of total)?",
      "Which endpoint has the slowest average response time?",
      "Identify any suspicious patterns (e.g., unusual traffic spikes, repeated errors from specific user agents).",
      "What percentage of requests come from AgentBot vs regular browsers?",
    ],
  }),
  hard: () => ({
    name: "Combined Operations Analysis",
    description: "Cross-reference sales data with server logs to find correlations",
    data: `=== SALES DATA ===\n${generateSalesData(100)}\n\n=== SERVER LOGS ===\n${generateServerLogs(300)}`,
    questions: [
      "Is there a correlation between server errors and drops in sales revenue?",
      "Which days had both high server error rates AND low sales? List them.",
      "Write a brief incident report summarizing the operational health of this system.",
      "Recommend 3 specific actions to improve both system reliability and sales performance.",
    ],
  }),
};

export class DataAnalysisTask extends TaskGenerator {
  readonly type = "data-analysis" as const;
  readonly source = "ambient" as const;
  readonly baseReward: ResourceDelta = { water: 15, food: 12 };
  readonly baseDeadlineMinutes = 60;

  generate(day: number, difficulty: DifficultyProfile): TaskDefinition {
    const { reward, deadlineMinutes } = this.scaled(day);
    const tier = difficulty.complexity <= 3 ? "easy" : difficulty.complexity <= 6 ? "medium" : "hard";
    const dataset = DATASETS[tier]!();

    return {
      id: this.makeId(day),
      type: this.type,
      source: this.source,
      claimMode: "parallel",
      day,
      difficulty: difficulty.complexity,
      title: `Data Analysis: ${dataset.name}`,
      description: `Analyze the following dataset and answer the questions.\n\nDataset: ${dataset.description}\n\n${dataset.data}\n\nQuestions:\n${dataset.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nProvide clear, data-backed answers. Show your work (calculations, code used, etc.).`,
      reward,
      deadlineMinutes,
      maxCompletions: 8,
      toolsRequired: ["code-runner", "data-analysis"],
    };
  }

  async evaluate(submission: unknown): Promise<boolean> {
    if (!submission || typeof submission !== "object") return false;
    const answer = (submission as any).answer;
    return typeof answer === "string" && answer.length > 100;
  }
}
