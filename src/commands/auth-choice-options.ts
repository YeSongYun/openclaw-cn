import type { AuthProfileStore } from "../agents/auth-profiles.js";
import { ta } from "../i18n/index.js";
import { AUTH_CHOICE_LEGACY_ALIASES_FOR_CLI } from "./auth-choice-legacy.js";
import { ONBOARD_PROVIDER_AUTH_FLAGS } from "./onboard-provider-auth-flags.js";
import type { AuthChoice, AuthChoiceGroupId } from "./onboard-types.js";

export type { AuthChoiceGroupId };

export type AuthChoiceOption = {
  value: AuthChoice;
  label: string;
  hint?: string;
};
export type AuthChoiceGroup = {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  options: AuthChoiceOption[];
};

const AUTH_CHOICE_GROUP_DEFS: {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  choices: AuthChoice[];
}[] = [
  {
    value: "dmxapi",
    label: "DMXAPI",
    hint: ta("group.dmxapi.hint", "多模型代理（Claude / GPT / Gemini）"),
    choices: ["dmxapi-api-key"],
  },
  {
    value: "openai",
    label: "OpenAI",
    hint: ta("group.openai.hint", "Codex OAuth + API key"),
    choices: ["openai-codex", "openai-api-key"],
  },
  {
    value: "anthropic",
    label: "Anthropic",
    hint: ta("group.anthropic.hint", "setup-token + API key"),
    choices: ["token", "apiKey"],
  },
  {
    value: "chutes",
    label: "Chutes",
    hint: ta("group.chutes.hint", "OAuth"),
    choices: ["chutes"],
  },
  {
    value: "vllm",
    label: "vLLM",
    hint: ta("group.vllm.hint", "Local/self-hosted OpenAI-compatible"),
    choices: ["vllm"],
  },
  {
    value: "minimax",
    label: "MiniMax",
    hint: ta("group.minimax.hint", "M2.5 (recommended)"),
    choices: ["minimax-portal", "minimax-api", "minimax-api-key-cn", "minimax-api-lightning"],
  },
  {
    value: "moonshot",
    label: "Moonshot AI (Kimi K2.5)",
    hint: ta("group.moonshot.hint", "Kimi K2.5 + Kimi Coding"),
    choices: ["moonshot-api-key", "moonshot-api-key-cn", "kimi-code-api-key"],
  },
  {
    value: "google",
    label: "Google",
    hint: ta("group.google.hint", "Gemini API key + OAuth"),
    choices: ["gemini-api-key", "google-gemini-cli"],
  },
  {
    value: "xai",
    label: "xAI (Grok)",
    hint: ta("group.xai.hint", "API key"),
    choices: ["xai-api-key"],
  },
  {
    value: "mistral",
    label: "Mistral AI",
    hint: ta("group.mistral.hint", "API key"),
    choices: ["mistral-api-key"],
  },
  {
    value: "volcengine",
    label: "Volcano Engine",
    hint: ta("group.volcengine.hint", "API key"),
    choices: ["volcengine-api-key"],
  },
  {
    value: "byteplus",
    label: "BytePlus",
    hint: ta("group.byteplus.hint", "API key"),
    choices: ["byteplus-api-key"],
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    hint: ta("group.openrouter.hint", "API key"),
    choices: ["openrouter-api-key"],
  },
  {
    value: "kilocode",
    label: "Kilo Gateway",
    hint: ta("group.kilocode.hint", "API key (OpenRouter-compatible)"),
    choices: ["kilocode-api-key"],
  },
  {
    value: "qwen",
    label: "Qwen",
    hint: ta("group.qwen.hint", "OAuth"),
    choices: ["qwen-portal"],
  },
  {
    value: "zai",
    label: "Z.AI",
    hint: ta("group.zai.hint", "GLM Coding Plan / Global / CN"),
    choices: ["zai-coding-global", "zai-coding-cn", "zai-global", "zai-cn"],
  },
  {
    value: "qianfan",
    label: "Qianfan",
    hint: ta("group.qianfan.hint", "API key"),
    choices: ["qianfan-api-key"],
  },
  {
    value: "copilot",
    label: "Copilot",
    hint: ta("group.copilot.hint", "GitHub + local proxy"),
    choices: ["github-copilot", "copilot-proxy"],
  },
  {
    value: "ai-gateway",
    label: "Vercel AI Gateway",
    hint: ta("group.ai-gateway.hint", "API key"),
    choices: ["ai-gateway-api-key"],
  },
  {
    value: "opencode-zen",
    label: "OpenCode Zen",
    hint: ta("group.opencode-zen.hint", "API key"),
    choices: ["opencode-zen"],
  },
  {
    value: "xiaomi",
    label: "Xiaomi",
    hint: ta("group.xiaomi.hint", "API key"),
    choices: ["xiaomi-api-key"],
  },
  {
    value: "synthetic",
    label: "Synthetic",
    hint: ta("group.synthetic.hint", "Anthropic-compatible (multi-model)"),
    choices: ["synthetic-api-key"],
  },
  {
    value: "together",
    label: "Together AI",
    hint: ta("group.together.hint", "API key"),
    choices: ["together-api-key"],
  },
  {
    value: "huggingface",
    label: "Hugging Face",
    hint: ta("group.huggingface.hint", "Inference API (HF token)"),
    choices: ["huggingface-api-key"],
  },
  {
    value: "venice",
    label: "Venice AI",
    hint: ta("group.venice.hint", "Privacy-focused (uncensored models)"),
    choices: ["venice-api-key"],
  },
  {
    value: "litellm",
    label: "LiteLLM",
    hint: ta("group.litellm.hint", "Unified LLM gateway (100+ providers)"),
    choices: ["litellm-api-key"],
  },
  {
    value: "cloudflare-ai-gateway",
    label: "Cloudflare AI Gateway",
    hint: ta("group.cloudflare-ai-gateway.hint", "Account ID + Gateway ID + API key"),
    choices: ["cloudflare-ai-gateway-api-key"],
  },
  {
    value: "custom",
    label: ta("group.custom.label", "Custom Provider"),
    hint: ta("group.custom.hint", "Any OpenAI or Anthropic compatible endpoint"),
    choices: ["custom-api-key"],
  },
];

const PROVIDER_AUTH_CHOICE_OPTION_HINTS: Partial<Record<AuthChoice, string>> = {
  "litellm-api-key": ta("optionHint.litellm", "Unified gateway for 100+ LLM providers"),
  "cloudflare-ai-gateway-api-key": ta("optionHint.cloudflare", "Account ID + Gateway ID + API key"),
  "venice-api-key": ta("optionHint.venice", "Privacy-focused inference (uncensored models)"),
  "together-api-key": ta(
    "optionHint.together",
    "Access to Llama, DeepSeek, Qwen, and more open models",
  ),
  "huggingface-api-key": ta(
    "optionHint.huggingface",
    "Inference Providers — OpenAI-compatible chat",
  ),
};

const PROVIDER_AUTH_CHOICE_OPTION_LABELS: Partial<Record<AuthChoice, string>> = {
  "moonshot-api-key": "Kimi API key (.ai)",
  "moonshot-api-key-cn": "Kimi API key (.cn)",
  "kimi-code-api-key": ta("optionLabel.kimiCode", "Kimi Code API key (subscription)"),
  "cloudflare-ai-gateway-api-key": "Cloudflare AI Gateway",
};

function buildProviderAuthChoiceOptions(): AuthChoiceOption[] {
  return ONBOARD_PROVIDER_AUTH_FLAGS.map((flag) => ({
    value: flag.authChoice,
    label: PROVIDER_AUTH_CHOICE_OPTION_LABELS[flag.authChoice] ?? flag.description,
    ...(PROVIDER_AUTH_CHOICE_OPTION_HINTS[flag.authChoice]
      ? { hint: PROVIDER_AUTH_CHOICE_OPTION_HINTS[flag.authChoice] }
      : {}),
  }));
}

const BASE_AUTH_CHOICE_OPTIONS: ReadonlyArray<AuthChoiceOption> = [
  {
    value: "token",
    label: ta("option.token.label", "Anthropic token (paste setup-token)"),
    hint: ta("option.token.hint", "run `claude setup-token` elsewhere, then paste the token here"),
  },
  {
    value: "openai-codex",
    label: ta("option.openai-codex.label", "OpenAI Codex (ChatGPT OAuth)"),
  },
  { value: "chutes", label: ta("option.chutes.label", "Chutes (OAuth)") },
  {
    value: "vllm",
    label: ta("option.vllm.label", "vLLM (custom URL + model)"),
    hint: ta("option.vllm.hint", "Local/self-hosted OpenAI-compatible server"),
  },
  ...buildProviderAuthChoiceOptions(),
  {
    value: "moonshot-api-key-cn",
    label: "Kimi API key (.cn)",
  },
  {
    value: "github-copilot",
    label: ta("option.github-copilot.label", "GitHub Copilot (GitHub device login)"),
    hint: ta("option.github-copilot.hint", "Uses GitHub device flow"),
  },
  { value: "gemini-api-key", label: "Google Gemini API key" },
  {
    value: "google-gemini-cli",
    label: ta("option.google-gemini-cli.label", "Google Gemini CLI OAuth"),
    hint: ta(
      "option.google-gemini-cli.hint",
      "Unofficial flow; review account-risk warning before use",
    ),
  },
  { value: "zai-api-key", label: "Z.AI API key" },
  {
    value: "zai-coding-global",
    label: "Coding-Plan-Global",
    hint: ta("option.zai-coding-global.hint", "GLM Coding Plan Global (api.z.ai)"),
  },
  {
    value: "zai-coding-cn",
    label: "Coding-Plan-CN",
    hint: ta("option.zai-coding-cn.hint", "GLM Coding Plan CN (open.bigmodel.cn)"),
  },
  {
    value: "zai-global",
    label: ta("option.zai-global.label", "Global"),
    hint: ta("option.zai-global.hint", "Z.AI Global (api.z.ai)"),
  },
  {
    value: "zai-cn",
    label: ta("option.zai-cn.label", "CN"),
    hint: ta("option.zai-cn.hint", "Z.AI CN (open.bigmodel.cn)"),
  },
  {
    value: "xiaomi-api-key",
    label: "Xiaomi API key",
  },
  {
    value: "minimax-portal",
    label: ta("option.minimax-portal.label", "MiniMax OAuth"),
    hint: ta("option.minimax-portal.hint", "Oauth plugin for MiniMax"),
  },
  { value: "qwen-portal", label: ta("option.qwen-portal.label", "Qwen OAuth") },
  {
    value: "copilot-proxy",
    label: ta("option.copilot-proxy.label", "Copilot Proxy (local)"),
    hint: ta("option.copilot-proxy.hint", "Local proxy for VS Code Copilot models"),
  },
  { value: "apiKey", label: "Anthropic API key" },
  {
    value: "opencode-zen",
    label: ta("option.opencode-zen.label", "OpenCode Zen (multi-model proxy)"),
    hint: ta("option.opencode-zen.hint", "Claude, GPT, Gemini via opencode.ai/zen"),
  },
  { value: "minimax-api", label: "MiniMax M2.5" },
  {
    value: "minimax-api-key-cn",
    label: ta("option.minimax-api-key-cn.label", "MiniMax M2.5 (CN)"),
    hint: ta("option.minimax-api-key-cn.hint", "China endpoint (api.minimaxi.com)"),
  },
  {
    value: "minimax-api-lightning",
    label: ta("option.minimax-api-lightning.label", "MiniMax M2.5 Highspeed"),
    hint: ta("option.minimax-api-lightning.hint", "Official fast tier (legacy: Lightning)"),
  },
  {
    value: "dmxapi-api-key",
    label: "DMXAPI API key",
    hint: ta("option.dmxapi.hint", "DMXAPI 多模型代理，自动按模型选择 API 格式"),
  },
  { value: "custom-api-key", label: ta("option.custom.label", "Custom Provider") },
];

export function formatAuthChoiceChoicesForCli(params?: {
  includeSkip?: boolean;
  includeLegacyAliases?: boolean;
}): string {
  const includeSkip = params?.includeSkip ?? true;
  const includeLegacyAliases = params?.includeLegacyAliases ?? false;
  const values = BASE_AUTH_CHOICE_OPTIONS.map((opt) => opt.value);

  if (includeSkip) {
    values.push("skip");
  }
  if (includeLegacyAliases) {
    values.push(...AUTH_CHOICE_LEGACY_ALIASES_FOR_CLI);
  }

  return values.join("|");
}

export function buildAuthChoiceOptions(params: {
  store: AuthProfileStore;
  includeSkip: boolean;
}): AuthChoiceOption[] {
  void params.store;
  const options: AuthChoiceOption[] = [...BASE_AUTH_CHOICE_OPTIONS];

  if (params.includeSkip) {
    options.push({ value: "skip", label: ta("option.skip.label", "Skip for now") });
  }

  return options;
}

export function buildAuthChoiceGroups(params: { store: AuthProfileStore; includeSkip: boolean }): {
  groups: AuthChoiceGroup[];
  skipOption?: AuthChoiceOption;
} {
  const options = buildAuthChoiceOptions({
    ...params,
    includeSkip: false,
  });
  const optionByValue = new Map<AuthChoice, AuthChoiceOption>(
    options.map((opt) => [opt.value, opt]),
  );

  const groups = AUTH_CHOICE_GROUP_DEFS.map((group) => ({
    ...group,
    options: group.choices
      .map((choice) => optionByValue.get(choice))
      .filter((opt): opt is AuthChoiceOption => Boolean(opt)),
  }));

  const skipOption = params.includeSkip
    ? ({ value: "skip", label: ta("option.skip.label", "Skip for now") } satisfies AuthChoiceOption)
    : undefined;

  return { groups, skipOption };
}
