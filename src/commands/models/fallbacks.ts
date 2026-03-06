import { tc } from "../../i18n/index.js";
import type { RuntimeEnv } from "../../runtime.js";
import {
  addFallbackCommand,
  clearFallbacksCommand,
  listFallbacksCommand,
  removeFallbackCommand,
} from "./fallbacks-shared.js";

export async function modelsFallbacksListCommand(
  opts: { json?: boolean; plain?: boolean },
  runtime: RuntimeEnv,
) {
  return await listFallbacksCommand(
    { label: tc("model.fallbacksLabel", "Fallbacks"), key: "model" },
    opts,
    runtime,
  );
}

export async function modelsFallbacksAddCommand(modelRaw: string, runtime: RuntimeEnv) {
  return await addFallbackCommand(
    {
      label: tc("model.fallbacksLabel", "Fallbacks"),
      key: "model",
      logPrefix: tc("model.fallbacksLogPrefix", "Fallbacks"),
    },
    modelRaw,
    runtime,
  );
}

export async function modelsFallbacksRemoveCommand(modelRaw: string, runtime: RuntimeEnv) {
  return await removeFallbackCommand(
    {
      label: tc("model.fallbacksLabel", "Fallbacks"),
      key: "model",
      notFoundLabel: tc("model.fallbackNotFound", "Fallback"),
      logPrefix: tc("model.fallbacksLogPrefix", "Fallbacks"),
    },
    modelRaw,
    runtime,
  );
}

export async function modelsFallbacksClearCommand(runtime: RuntimeEnv) {
  return await clearFallbacksCommand(
    { key: "model", clearedMessage: tc("model.fallbackCleared", "Fallback list cleared.") },
    runtime,
  );
}
