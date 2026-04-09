import { TaskGenerator } from "./base.js";
import type { TaskDefinition, DifficultyProfile, ResourceDelta } from "@survivor/shared";

interface BugScenario {
  title: string;
  buggyCode: string;
  language: string;
  errorMessage: string;
  hint: string;
}

const BUGS: Record<string, BugScenario[]> = {
  easy: [
    {
      title: "Off-by-one in pagination",
      buggyCode: `function paginate(items, page, pageSize) {
  const start = page * pageSize;
  const end = start + pageSize;
  return {
    data: items.slice(start, end),
    totalPages: Math.floor(items.length / pageSize),
    currentPage: page
  };
}
// Bug: page 1 returns items 10-19 instead of 0-9
// Bug: totalPages is wrong for non-divisible lengths`,
      language: "javascript",
      errorMessage: "paginate(['a','b','c','d','e'], 1, 2) returns {data: ['c','d'], totalPages: 2} but expected {data: ['a','b'], totalPages: 3}",
      hint: "Pages should be 1-indexed, and Math.floor should be Math.ceil",
    },
    {
      title: "Mutable default argument",
      buggyCode: `def add_item(item, items=[]):
    items.append(item)
    return items

# Expected: each call returns a fresh list with one item
# Actual: items accumulate across calls
result1 = add_item("a")  # ['a'] ✓
result2 = add_item("b")  # ['a', 'b'] ✗ expected ['b']`,
      language: "python",
      errorMessage: "Second call to add_item('b') returns ['a', 'b'] instead of ['b']",
      hint: "Python mutable default arguments are shared across calls",
    },
  ],
  medium: [
    {
      title: "Race condition in counter",
      buggyCode: `class HitCounter {
  constructor() {
    this.hits = [];
  }

  hit(timestamp) {
    this.hits.push(timestamp);
  }

  getHits(timestamp) {
    // Return hits in the last 300 seconds
    return this.hits.filter(t => timestamp - t < 300).length;
  }
}
// Works correctly but has O(n) memory growth
// After millions of hits, the server runs out of memory
// Fix: maintain bounded memory while preserving correctness`,
      language: "javascript",
      errorMessage: "OOM after 10M hits. Memory grows linearly and old hits are never cleaned up.",
      hint: "Clean up expired hits, or use a fixed-size circular buffer / bucket approach",
    },
  ],
  hard: [
    {
      title: "Deadlock in async pipeline",
      buggyCode: `import asyncio

class Pipeline:
    def __init__(self, max_concurrent=3):
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.results = {}
        self.lock = asyncio.Lock()

    async def process(self, item_id, data):
        async with self.semaphore:
            result = await self._transform(data)
            async with self.lock:
                if item_id in self.results:
                    # Merge with existing result
                    async with self.semaphore:  # BUG: re-acquiring semaphore inside lock
                        merged = await self._merge(self.results[item_id], result)
                        self.results[item_id] = merged
                else:
                    self.results[item_id] = result

    async def _transform(self, data):
        await asyncio.sleep(0.1)
        return {"processed": data}

    async def _merge(self, old, new):
        await asyncio.sleep(0.05)
        return {**old, **new}`,
      language: "python",
      errorMessage: "Pipeline hangs when processing duplicate item_ids under load. Deadlock: semaphore acquired inside lock, then tries to re-acquire semaphore.",
      hint: "Never re-acquire the semaphore inside the lock. Restructure to release the semaphore before merging, or do merging outside the semaphore.",
    },
  ],
};

export class BugFixTask extends TaskGenerator {
  readonly type = "bug-fix" as const;
  readonly source = "ambient" as const;
  readonly baseReward: ResourceDelta = { water: 16, food: 14 };
  readonly baseDeadlineMinutes = 40;

  generate(day: number, difficulty: DifficultyProfile): TaskDefinition {
    const { reward, deadlineMinutes } = this.scaled(day);
    const tier = difficulty.complexity <= 3 ? "easy" : difficulty.complexity <= 7 ? "medium" : "hard";
    const bugs = BUGS[tier]!;
    const bug = bugs[Math.floor(Math.random() * bugs.length)]!;

    return {
      id: this.makeId(day),
      type: this.type,
      source: this.source,
      claimMode: "first_correct",
      day,
      difficulty: difficulty.complexity,
      title: `Bug Fix: ${bug.title}`,
      description: `Find and fix the bug in this ${bug.language} code:\n\n\`\`\`${bug.language}\n${bug.buggyCode}\n\`\`\`\n\nError: ${bug.errorMessage}\n\nSubmit the corrected code with an explanation of the root cause.`,
      reward,
      penalty: { water: -3, food: -2 },
      deadlineMinutes,
      toolsRequired: ["code-runner"],
    };
  }

  async evaluate(submission: unknown): Promise<boolean> {
    if (!submission || typeof submission !== "object") return false;
    const answer = (submission as any).answer;
    return typeof answer === "string" && answer.length > 30;
  }
}
