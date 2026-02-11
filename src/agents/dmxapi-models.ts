import type { ModelDefinitionConfig } from "../config/types.js";

export const DMXAPI_DEFAULT_BASE_URL = "https://www.dmxapi.cn";
export const DMXAPI_DEFAULT_MODEL_ID = "claude-opus-4-6-cc";
export const DMXAPI_DEFAULT_MODEL_REF = `dmxapi/${DMXAPI_DEFAULT_MODEL_ID}`;
export const DMXAPI_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const DMXAPI_MODEL_CATALOG = [
  {
    id: "claude-opus-4-6-cc",
    name: "Claude Opus 4.6 CC",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 200000,
    maxTokens: 16384,
  },
  {
    id: "claude-sonnet-4-5-20250929-cc",
    name: "Claude Sonnet 4.5 CC",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "claude-haiku-4-5-20251001-cc",
    name: "Claude Haiku 4.5 CC",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 200000,
    maxTokens: 8192,
  },
] as const;

export type DmxapiCatalogEntry = (typeof DMXAPI_MODEL_CATALOG)[number];

export interface DmxapiModelEntry {
  id: string;
  name: string;
  reasoning: boolean;
  input: readonly ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
}

export function buildDmxapiModelDefinition(entry: DmxapiModelEntry): ModelDefinitionConfig {
  return {
    id: entry.id,
    name: entry.name,
    reasoning: entry.reasoning,
    input: [...entry.input],
    cost: DMXAPI_DEFAULT_COST,
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
  };
}
