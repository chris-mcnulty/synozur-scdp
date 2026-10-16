import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

/** Offline operator inputs; never load these from a public application directory. */
export function requirePrivateFile(file: string, guidance: string): string {
  const resolved = resolve(file);
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new Error(`Required input file is missing. ${guidance}`);
  }
  return resolved;
}

/** Appended option, so existing positional arguments retain their meaning. */
export function privateInputDirectory(args = process.argv.slice(2)): string {
  const index = args.indexOf("--input-dir");
  if (index === -1) return resolve("private-inputs/ai-guardrails");
  if (!args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error("--input-dir requires a private directory path");
  }
  return resolve(args[index + 1]);
}

export function privateInputPositionals(args = process.argv.slice(2)): string[] {
  privateInputDirectory(args); // Validate the option before stripping it.
  const index = args.indexOf("--input-dir");
  return index === -1 ? args : [...args.slice(0, index), ...args.slice(index + 2)];
}
