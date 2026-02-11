import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setIrcRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getIrcRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("IRC 运行时未初始化");
  }
  return runtime;
}
