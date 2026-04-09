import { TaskGenerator } from "./base.js";
import type { TaskDefinition, DifficultyProfile, ResourceDelta } from "@survivor/shared";

interface CodeProblem {
  title: string;
  description: string;
  testCases: Array<{ input: string; expected: string }>;
  language: "python" | "javascript";
}

const PROBLEMS: Record<string, CodeProblem[]> = {
  easy: [
    {
      title: "FizzBuzz Variant",
      description: "Write a function that takes a number n and returns a list of strings from 1 to n. For multiples of 3, use 'Fizz'. For multiples of 5, use 'Buzz'. For multiples of both, use 'FizzBuzz'. For multiples of 7, use 'Wizz'. Otherwise, use the number as a string.",
      testCases: [
        { input: "15", expected: '["1","2","Fizz","4","Buzz","Fizz","Wizz","8","Fizz","Buzz","11","Fizz","13","Wizz","FizzBuzz"]' },
        { input: "7", expected: '["1","2","Fizz","4","Buzz","Fizz","Wizz"]' },
      ],
      language: "python",
    },
    {
      title: "Palindrome Check",
      description: "Write a function that checks if a string is a palindrome, ignoring case and non-alphanumeric characters. Return true/false.",
      testCases: [
        { input: '"A man, a plan, a canal: Panama"', expected: "true" },
        { input: '"race a car"', expected: "false" },
        { input: '"Was it a car or a cat I saw?"', expected: "true" },
      ],
      language: "javascript",
    },
  ],
  medium: [
    {
      title: "Matrix Spiral",
      description: "Given an m x n matrix, return all elements in spiral order (clockwise from top-left). Input is a JSON array of arrays.",
      testCases: [
        { input: "[[1,2,3],[4,5,6],[7,8,9]]", expected: "[1,2,3,6,9,8,7,4,5]" },
        { input: "[[1,2,3,4],[5,6,7,8],[9,10,11,12]]", expected: "[1,2,3,4,8,12,11,10,9,5,6,7]" },
      ],
      language: "python",
    },
    {
      title: "LRU Cache",
      description: "Implement an LRU cache with get(key) and put(key, value) methods. The cache has a fixed capacity. When full, evict the least recently used item. Return the sequence of get() results for the given operations.",
      testCases: [
        {
          input: '{"capacity":2,"ops":[["put",1,1],["put",2,2],["get",1],["put",3,3],["get",2],["put",4,4],["get",1],["get",3],["get",4]]}',
          expected: "[1,-1,-1,3,4]",
        },
      ],
      language: "python",
    },
  ],
  hard: [
    {
      title: "Expression Evaluator",
      description: "Build a parser that evaluates arithmetic expressions with +, -, *, /, parentheses, and unary minus. Support floating point. Return the result rounded to 2 decimal places.",
      testCases: [
        { input: '"3 + 4 * 2 / (1 - 5)"', expected: "1.00" },
        { input: '"-(3 + 4) * 2"', expected: "-14.00" },
        { input: '"2.5 * (3 + 4.5) / 2 - 1"', expected: "8.38" },
      ],
      language: "python",
    },
  ],
};

export class CodeChallengeTask extends TaskGenerator {
  readonly type = "code-challenge" as const;
  readonly source = "urgent" as const;
  readonly baseReward: ResourceDelta = { water: 20, food: 15 };
  readonly baseDeadlineMinutes = 30;

  generate(day: number, difficulty: DifficultyProfile): TaskDefinition {
    const { reward, deadlineMinutes } = this.scaled(day);
    const tier = difficulty.complexity <= 3 ? "easy" : difficulty.complexity <= 7 ? "medium" : "hard";
    const problems = PROBLEMS[tier]!;
    const problem = problems[Math.floor(Math.random() * problems.length)]!;

    const testCaseStr = problem.testCases
      .map((tc, i) => `Test ${i + 1}: Input: ${tc.input} → Expected: ${tc.expected}`)
      .join("\n");

    return {
      id: this.makeId(day),
      type: this.type,
      source: this.source,
      claimMode: "first_correct",
      day,
      difficulty: difficulty.complexity,
      title: problem.title,
      description: `Solve this coding challenge in ${problem.language}.\n\n${problem.description}\n\n${testCaseStr}\n\nSubmit your solution as working code.`,
      reward,
      penalty: { water: -5, food: -3 },
      deadlineMinutes,
      toolsRequired: ["code-runner"],
    };
  }

  async evaluate(submission: unknown): Promise<boolean> {
    if (!submission || typeof submission !== "object") return false;
    const answer = (submission as any).answer;
    return typeof answer === "string" && answer.length > 10;
  }
}
