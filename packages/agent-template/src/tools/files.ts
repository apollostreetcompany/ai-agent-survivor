import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";

const WORKSPACE = process.env.AGENT_WORKSPACE || "./workspace";

/** Read a file from the agent's workspace */
export function readFile(path: string): { content: string; success: boolean; error?: string } {
  try {
    const fullPath = resolvePath(path);
    const content = readFileSync(fullPath, "utf-8");
    return { content, success: true };
  } catch (err: any) {
    return { content: "", success: false, error: err.message };
  }
}

/** Write a file to the agent's workspace */
export function writeFile(path: string, content: string): { success: boolean; error?: string } {
  try {
    const fullPath = resolvePath(path);
    writeFileSync(fullPath, content, "utf-8");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** List files in a directory */
export function listFiles(path = "."): { files: string[]; success: boolean; error?: string } {
  try {
    const fullPath = resolvePath(path);
    const entries = readdirSync(fullPath, { withFileTypes: true });
    const files = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    return { files, success: true };
  } catch (err: any) {
    return { files: [], success: false, error: err.message };
  }
}

/** Check if a file/directory exists */
export function exists(path: string): boolean {
  return existsSync(resolvePath(path));
}

/** Resolve a path relative to the workspace */
function resolvePath(path: string): string {
  const resolved = join(WORKSPACE, path);
  // Prevent path traversal
  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}
