import { exec } from "./shell.js";
import { writeFile, readFile } from "./files.js";
import { randomUUID } from "crypto";

/** Run Python code and return the output */
export function runPython(code: string, timeout = 30_000): { output: string; success: boolean; error?: string } {
  const filename = `/tmp/agent-code-${randomUUID()}.py`;
  writeFile(filename, code);
  const result = exec(`python3 ${filename}`, { timeout });
  exec(`rm -f ${filename}`);
  return { output: result.stdout, success: result.success, error: result.error };
}

/** Run Node.js code and return the output */
export function runNode(code: string, timeout = 30_000): { output: string; success: boolean; error?: string } {
  const filename = `/tmp/agent-code-${randomUUID()}.mjs`;
  writeFile(filename, code);
  const result = exec(`node ${filename}`, { timeout });
  exec(`rm -f ${filename}`);
  return { output: result.stdout, success: result.success, error: result.error };
}

/** Run a shell script and return the output */
export function runShell(script: string, timeout = 30_000): { output: string; success: boolean; error?: string } {
  const result = exec(script, { timeout });
  return { output: result.stdout, success: result.success, error: result.error };
}
