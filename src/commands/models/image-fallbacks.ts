import { tc } from "../../i18n/index.js";
import type { RuntimeEnv } from "../../runtime.js";
import {
  addFallbackCommand,
  clearFallbacksCommand,
  listFallbacksCommand,
  removeFallbackCommand,
} from "./fallbacks-shared.js";

export async function modelsImageFallbacksListCommand(
  opts: { json?: boolean; plain?: boolean },
  runtime: RuntimeEnv,
) {
  return await listFallbacksCommand(
    { label: tc("model.imageFallbacksLabel", "Image fallbacks"), key: "imageModel" },
    opts,
    runtime,
  );
}

export async function modelsImageFallbacksAddCommand(modelRaw: string, runtime: RuntimeEnv) {
  return await addFallbackCommand(
    {
      label: tc("model.imageFallbacksLabel", "Image fallbacks"),
      key: "imageModel",
      logPrefix: tc("model.imageFallbacksLogPrefix", "Image fallbacks"),
    },
    modelRaw,
    runtime,
  );
}

export async function modelsImageFallbacksRemoveCommand(modelRaw: string, runtime: RuntimeEnv) {
  return await removeFallbackCommand(
    {
      label: tc("model.imageFallbacksLabel", "Image fallbacks"),
      key: "imageModel",
      notFoundLabel: tc("model.imageFallbackNotFound", "Image fallback"),
      logPrefix: tc("model.imageFallbacksLogPrefix", "Image fallbacks"),
    },
    modelRaw,
    runtime,
  );
}

export async function modelsImageFallbacksClearCommand(runtime: RuntimeEnv) {
  return await clearFallbacksCommand(
    {
      key: "imageModel",
      clearedMessage: tc("model.imageFallbackCleared", "Image fallback list cleared."),
    },
    runtime,
  );
}
