import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setGoogleChatRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getGoogleChatRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Google Chat 运行时未初始化");
  }
  return runtime;
}
