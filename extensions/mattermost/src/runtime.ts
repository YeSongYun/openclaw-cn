import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setMattermostRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getMattermostRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Mattermost 运行时未初始化");
  }
  return runtime;
}
