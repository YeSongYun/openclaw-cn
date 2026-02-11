import type { OpenClawConfig, DmPolicy } from "openclaw/plugin-sdk";
import {
  addWildcardAllowFrom,
  formatDocsLink,
  promptAccountId,
  type ChannelOnboardingAdapter,
  type ChannelOnboardingDmPolicy,
  type WizardPrompter,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  migrateBaseNameToDefaultAccount,
} from "openclaw/plugin-sdk";
import {
  listGoogleChatAccountIds,
  resolveDefaultGoogleChatAccountId,
  resolveGoogleChatAccount,
} from "./accounts.js";

const channel = "googlechat" as const;

const ENV_SERVICE_ACCOUNT = "GOOGLE_CHAT_SERVICE_ACCOUNT";
const ENV_SERVICE_ACCOUNT_FILE = "GOOGLE_CHAT_SERVICE_ACCOUNT_FILE";

function setGoogleChatDmPolicy(cfg: OpenClawConfig, policy: DmPolicy) {
  const allowFrom =
    policy === "open"
      ? addWildcardAllowFrom(cfg.channels?.["googlechat"]?.dm?.allowFrom)
      : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      googlechat: {
        ...cfg.channels?.["googlechat"],
        dm: {
          ...cfg.channels?.["googlechat"]?.dm,
          policy,
          ...(allowFrom ? { allowFrom } : {}),
        },
      },
    },
  };
}

function parseAllowFromInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function promptAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
}): Promise<OpenClawConfig> {
  const current = params.cfg.channels?.["googlechat"]?.dm?.allowFrom ?? [];
  const entry = await params.prompter.text({
    message: "Google Chat 白名单（用户 ID 或邮箱）",
    placeholder: "users/123456789, name@example.com",
    initialValue: current[0] ? String(current[0]) : undefined,
    validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
  });
  const parts = parseAllowFromInput(String(entry));
  const unique = [...new Set(parts)];
  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      googlechat: {
        ...params.cfg.channels?.["googlechat"],
        enabled: true,
        dm: {
          ...params.cfg.channels?.["googlechat"]?.dm,
          policy: "allowlist",
          allowFrom: unique,
        },
      },
    },
  };
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Google Chat",
  channel,
  policyKey: "channels.googlechat.dm.policy",
  allowFromKey: "channels.googlechat.dm.allowFrom",
  getCurrent: (cfg) => cfg.channels?.["googlechat"]?.dm?.policy ?? "pairing",
  setPolicy: (cfg, policy) => setGoogleChatDmPolicy(cfg, policy),
  promptAllowFrom,
};

function applyAccountConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  patch: Record<string, unknown>;
}): OpenClawConfig {
  const { cfg, accountId, patch } = params;
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        googlechat: {
          ...cfg.channels?.["googlechat"],
          enabled: true,
          ...patch,
        },
      },
    };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      googlechat: {
        ...cfg.channels?.["googlechat"],
        enabled: true,
        accounts: {
          ...cfg.channels?.["googlechat"]?.accounts,
          [accountId]: {
            ...cfg.channels?.["googlechat"]?.accounts?.[accountId],
            enabled: true,
            ...patch,
          },
        },
      },
    },
  };
}

async function promptCredentials(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<OpenClawConfig> {
  const { cfg, prompter, accountId } = params;
  const envReady =
    accountId === DEFAULT_ACCOUNT_ID &&
    (Boolean(process.env[ENV_SERVICE_ACCOUNT]) || Boolean(process.env[ENV_SERVICE_ACCOUNT_FILE]));
  if (envReady) {
    const useEnv = await prompter.confirm({
      message: "是否使用 GOOGLE_CHAT_SERVICE_ACCOUNT 环境变量？",
      initialValue: true,
    });
    if (useEnv) {
      return applyAccountConfig({ cfg, accountId, patch: {} });
    }
  }

  const method = await prompter.select({
    message: "Google Chat 认证方式",
    options: [
      { value: "file", label: "服务账号 JSON 文件" },
      { value: "inline", label: "粘贴服务账号 JSON" },
    ],
    initialValue: "file",
  });

  if (method === "file") {
    const path = await prompter.text({
      message: "服务账号 JSON 文件路径",
      placeholder: "/path/to/service-account.json",
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });
    return applyAccountConfig({
      cfg,
      accountId,
      patch: { serviceAccountFile: String(path).trim() },
    });
  }

  const json = await prompter.text({
    message: "服务账号 JSON（单行）",
    placeholder: '{"type":"service_account", ... }',
    validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
  });
  return applyAccountConfig({
    cfg,
    accountId,
    patch: { serviceAccount: String(json).trim() },
  });
}

async function promptAudience(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<OpenClawConfig> {
  const account = resolveGoogleChatAccount({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  const currentType = account.config.audienceType ?? "app-url";
  const currentAudience = account.config.audience ?? "";
  const audienceType = await params.prompter.select({
    message: "Webhook 受众类型",
    options: [
      { value: "app-url", label: "应用 URL（推荐）" },
      { value: "project-number", label: "项目编号" },
    ],
    initialValue: currentType === "project-number" ? "project-number" : "app-url",
  });
  const audience = await params.prompter.text({
    message: audienceType === "project-number" ? "项目编号" : "应用 URL",
    placeholder: audienceType === "project-number" ? "1234567890" : "https://your.host/googlechat",
    initialValue: currentAudience || undefined,
    validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
  });
  return applyAccountConfig({
    cfg: params.cfg,
    accountId: params.accountId,
    patch: { audienceType, audience: String(audience).trim() },
  });
}

async function noteGoogleChatSetup(prompter: WizardPrompter) {
  await prompter.note(
    [
      "Google Chat 应用使用服务账号认证和 HTTPS Webhook。",
      "在服务账号中设置 Chat API 权限范围并配置 Chat 应用 URL。",
      "Webhook 验证需要受众类型和受众值。",
      `Docs: ${formatDocsLink("/channels/googlechat", "channels/googlechat")}`,
    ].join("\n"),
    "Google Chat 设置",
  );
}

export const googlechatOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  dmPolicy,
  getStatus: async ({ cfg }) => {
    const configured = listGoogleChatAccountIds(cfg).some(
      (accountId) => resolveGoogleChatAccount({ cfg, accountId }).credentialSource !== "none",
    );
    return {
      channel,
      configured,
      statusLines: [`Google Chat：${configured ? "已配置" : "需要服务账号"}`],
      selectionHint: configured ? "已配置" : "需要认证",
    };
  },
  configure: async ({ cfg, prompter, accountOverrides, shouldPromptAccountIds }) => {
    const override = accountOverrides["googlechat"]?.trim();
    const defaultAccountId = resolveDefaultGoogleChatAccountId(cfg);
    let accountId = override ? normalizeAccountId(override) : defaultAccountId;
    if (shouldPromptAccountIds && !override) {
      accountId = await promptAccountId({
        cfg,
        prompter,
        label: "Google Chat",
        currentId: accountId,
        listAccountIds: listGoogleChatAccountIds,
        defaultAccountId,
      });
    }

    let next = cfg;
    await noteGoogleChatSetup(prompter);
    next = await promptCredentials({ cfg: next, prompter, accountId });
    next = await promptAudience({ cfg: next, prompter, accountId });

    const namedConfig = migrateBaseNameToDefaultAccount({
      cfg: next,
      channelKey: "googlechat",
    });

    return { cfg: namedConfig, accountId };
  },
};
