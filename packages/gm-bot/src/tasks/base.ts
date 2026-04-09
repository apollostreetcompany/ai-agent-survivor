import type { TaskDefinition, ResourceDelta, DifficultyProfile } from "@survivor/shared";
import { scaleReward, getDeadlineMultiplier } from "../engine/difficulty.js";
import { createTask } from "../engine/task-manager.js";
import { sendGmMessage, sendText } from "../discord/client.js";
import { CHANNELS } from "@survivor/shared";
import { randomUUID } from "crypto";

/** Base class for all task generators */
export abstract class TaskGenerator {
  abstract readonly type: TaskDefinition["type"];
  abstract readonly source: TaskDefinition["source"];
  abstract readonly baseReward: ResourceDelta;
  abstract readonly baseDeadlineMinutes: number;

  /** Generate a task definition for the given day/difficulty */
  abstract generate(day: number, difficulty: DifficultyProfile): TaskDefinition;

  /** Evaluate an agent's submission. Returns true if the submission is valid. */
  abstract evaluate(submission: unknown, definition: TaskDefinition): Promise<boolean>;

  /** Helper: create a task ID */
  protected makeId(day: number, suffix?: string): string {
    return `${this.type}-d${day}-${suffix || randomUUID().slice(0, 8)}`;
  }

  /** Helper: scale reward and deadline for difficulty */
  protected scaled(day: number) {
    return {
      reward: scaleReward(this.baseReward, day),
      deadlineMinutes: Math.max(5, Math.round(this.baseDeadlineMinutes * getDeadlineMultiplier(day))),
    };
  }

  /** Spawn and announce this task */
  async spawn(day: number, difficulty: DifficultyProfile): Promise<TaskDefinition> {
    const def = this.generate(day, difficulty);
    createTask(def);

    if (def.source === "urgent") {
      await sendGmMessage(CHANNELS.ARENA, {
        tag: "GM:TASK:URGENT",
        id: def.id,
        type: def.type,
        reward: def.reward,
        penalty: def.penalty,
        description: def.description,
        deadlineMinutes: def.deadlineMinutes ?? this.baseDeadlineMinutes,
        claimMode: def.claimMode,
      });
    }

    return def;
  }
}
