import { execSync, type ExecSyncOptions } from "child_process";

const DEFAULT_TIMEOUT = 30_000; // 30 seconds
const MAX_OUTPUT = 10_000; // characters

/** Execute a shell command and return stdout */
export function exec(
  command: string,
  options: { timeout?: number; cwd?: string } = {},
): { stdout: string; success: boolean; error?: string } {
  try {
    const opts: ExecSyncOptions = {
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      cwd: options.cwd,
      maxBuffer: 1024 * 1024, // 1MB
      encoding: "utf-8",
    };

    const stdout = execSync(command, opts) as string;
    const trimmed = stdout.length > MAX_OUTPUT
      ? stdout.slice(0, MAX_OUTPUT) + "\n... (truncated)"
      : stdout;

    return { stdout: trimmed, success: true };
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() || "",
      success: false,
      error: err.stderr?.toString() || err.message,
    };
  }
}
