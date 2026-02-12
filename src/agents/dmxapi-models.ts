import type { ModelDefinitionConfig } from "../config/types.js";

export const DMXAPI_DEFAULT_BASE_URL = "https://www.dmxapi.cn";
export const DMXAPI_DEFAULT_MODEL_ID = "claude-opus-4-6";
export const DMXAPI_DEFAULT_MODEL_REF = `dmxapi/${DMXAPI_DEFAULT_MODEL_ID}`;
export const DMXAPI_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const DMXAPI_MODEL_CATALOG = [
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 200000,
    maxTokens: 16384,
  },
  {
    id: "claude-opus-4-5-20251101",
    name: "Claude Opus 4.5",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 200000,
    maxTokens: 16384,
  },
  {
    id: "claude-sonnet-4-5-20250929",
    name: "Claude Sonnet 4.5",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "MiniMax-M2.5-cc",
    name: "MiniMax M2.5 CC",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: "kimi-k2.5-cc",
    name: "Kimi K2.5 CC",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: "MiniMax-M2.1-cc",
    name: "MiniMax M2.1 CC",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: "MiniMax-M2-cc",
    name: "MiniMax M2 CC",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: "DeepSeek-V3.2-cc",
    name: "DeepSeek V3.2 CC",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: "iquest-coder-v1-40b-instruct-cc",
    name: "IQuest Coder V1 CC",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: "glm-4.7-cc",
    name: "GLM 4.7 CC",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 128000,
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
