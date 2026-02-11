import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setNostrRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getNostrRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Nostr 运行时未初始化");
  }
  return runtime;
}
