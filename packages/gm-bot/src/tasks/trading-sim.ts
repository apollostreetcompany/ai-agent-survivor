import { TaskGenerator } from "./base.js";
import type { TaskDefinition, DifficultyProfile, ResourceDelta } from "@survivor/shared";

interface MarketState {
  assets: Record<string, number[]>; // asset name -> price history
  currentPrices: Record<string, number>;
  round: number;
  totalRounds: number;
}

function generateMarketData(rounds: number, assetCount: number): MarketState {
  const assetNames = ["ALPHA", "BETA", "GAMMA", "DELTA", "OMEGA"].slice(0, assetCount);
  const assets: Record<string, number[]> = {};
  const startPrices: Record<string, number> = {};

  for (const name of assetNames) {
    const startPrice = 50 + Math.random() * 150;
    startPrices[name] = Math.round(startPrice * 100) / 100;
    assets[name] = [startPrices[name]!];

    // Generate price history with trends and volatility
    let price = startPrices[name]!;
    const trend = (Math.random() - 0.5) * 0.02; // slight trend
    const volatility = 0.03 + Math.random() * 0.07;

    for (let i = 1; i < rounds; i++) {
      const change = trend + (Math.random() - 0.5) * volatility;
      price = Math.max(1, price * (1 + change));
      assets[name]!.push(Math.round(price * 100) / 100);
    }
  }

  return {
    assets,
    currentPrices: Object.fromEntries(
      assetNames.map((name) => [name, assets[name]![assets[name]!.length - 1]!]),
    ),
    round: rounds,
    totalRounds: rounds,
  };
}

export class TradingSimTask extends TaskGenerator {
  readonly type = "trading-sim" as const;
  readonly source = "urgent" as const;
  readonly baseReward: ResourceDelta = { water: 25, food: 20 };
  readonly baseDeadlineMinutes = 45;

  generate(day: number, difficulty: DifficultyProfile): TaskDefinition {
    const { reward, deadlineMinutes } = this.scaled(day);
    const rounds = 10 + difficulty.complexity * 4; // 14 to 50 rounds
    const assetCount = Math.min(5, 2 + Math.floor(difficulty.complexity / 3));
    const market = generateMarketData(rounds, assetCount);

    // Show partial history, ask for trading decisions
    const historyWindow = Math.min(10, Math.floor(rounds / 2));
    const visibleHistory: Record<string, number[]> = {};
    for (const [name, prices] of Object.entries(market.assets)) {
      visibleHistory[name] = prices.slice(-historyWindow);
    }

    return {
      id: this.makeId(day),
      type: this.type,
      source: this.source,
      claimMode: "parallel",
      day,
      difficulty: difficulty.complexity,
      title: `Market Madness: ${assetCount}-Asset Trading`,
      description: `You are a trading agent with $10,000 starting capital.\n\nCurrent market data (last ${historyWindow} rounds):\n${JSON.stringify(visibleHistory, null, 2)}\n\nCurrent prices: ${JSON.stringify(market.currentPrices)}\n\nSubmit your portfolio allocation as a JSON object mapping asset names to dollar amounts. Total must not exceed $10,000. Unallocated funds stay as cash.\n\nExample: {"ALPHA": 3000, "BETA": 5000} (leaving $2000 in cash)\n\nYou will be scored on the quality of your analysis and allocation strategy.`,
      reward,
      penalty: { water: -3, food: -2 },
      deadlineMinutes,
      maxCompletions: 16,
      toolsRequired: ["code-runner", "data-analysis"],
    };
  }

  async evaluate(submission: unknown): Promise<boolean> {
    if (!submission || typeof submission !== "object") return false;
    const answer = (submission as any).answer;
    if (typeof answer !== "string") return false;

    // Try to parse as JSON allocation
    try {
      const allocation = JSON.parse(answer);
      if (typeof allocation !== "object") return false;
      const total = Object.values(allocation).reduce((sum: number, val) => sum + (val as number), 0);
      return total <= 10000 && total > 0;
    } catch {
      // Accept text-based analysis too
      return answer.length > 50;
    }
  }
}
