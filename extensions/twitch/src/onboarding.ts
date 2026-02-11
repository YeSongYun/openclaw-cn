/**
 * Twitch onboarding adapter for CLI setup wizard.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import {
  formatDocsLink,
  promptChannelAccessConfig,
  type ChannelOnboardingAdapter,
  type ChannelOnboardingDmPolicy,
  type WizardPrompter,
} from "openclaw/plugin-sdk";
import type { TwitchAccountConfig, TwitchRole } from "./types.js";
import { DEFAULT_ACCOUNT_ID, getAccountConfig } from "./config.js";
import { isAccountConfigured } from "./utils/twitch.js";

const channel = "twitch" as const;

/**
 * Set Twitch account configuration
 */
function setTwitchAccount(
  cfg: OpenClawConfig,
  account: Partial<TwitchAccountConfig>,
): OpenClawConfig {
  const existing = getAccountConfig(cfg, DEFAULT_ACCOUNT_ID);
  const merged: TwitchAccountConfig = {
    username: account.username ?? existing?.username ?? "",
    accessToken: account.accessToken ?? existing?.accessToken ?? "",
    clientId: account.clientId ?? existing?.clientId ?? "",
    channel: account.channel ?? existing?.channel ?? "",
    enabled: account.enabled ?? existing?.enabled ?? true,
    allowFrom: account.allowFrom ?? existing?.allowFrom,
    allowedRoles: account.allowedRoles ?? existing?.allowedRoles,
    requireMention: account.requireMention ?? existing?.requireMention,
    clientSecret: account.clientSecret ?? existing?.clientSecret,
    refreshToken: account.refreshToken ?? existing?.refreshToken,
    expiresIn: account.expiresIn ?? existing?.expiresIn,
    obtainmentTimestamp: account.obtainmentTimestamp ?? existing?.obtainmentTimestamp,
  };

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      twitch: {
        ...((cfg.channels as Record<string, unknown>)?.twitch as
          | Record<string, unknown>
          | undefined),
        enabled: true,
        accounts: {
          ...((
            (cfg.channels as Record<string, unknown>)?.twitch as Record<string, unknown> | undefined
          )?.accounts as Record<string, unknown> | undefined),
          [DEFAULT_ACCOUNT_ID]: merged,
        },
      },
    },
  };
}

/**
 * Note about Twitch setup
 */
async function noteTwitchSetupHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "Twitch 需要一个带有 OAuth 令牌的 Bot 账户。",
      "1. 在 https://dev.twitch.tv/console 创建一个 Twitch 应用",
      "2. 生成一个包含 chat:read 和 chat:write 权限的令牌",
      "   使用 https://twitchtokengenerator.com/ 或 https://twitchapps.com/tmi/",
      "3. 复制令牌（以 'oauth:' 开头）和 Client ID",
      "支持的环境变量：OPENCLAW_TWITCH_ACCESS_TOKEN",
      `文档：${formatDocsLink("/channels/twitch", "channels/twitch")}`,
    ].join("\n"),
    "Twitch 设置",
  );
}

/**
 * Prompt for Twitch OAuth token with early returns.
 */
async function promptToken(
  prompter: WizardPrompter,
  account: TwitchAccountConfig | null,
  envToken: string | undefined,
): Promise<string> {
  const existingToken = account?.accessToken ?? "";

  // If we have an existing token and no env var, ask if we should keep it
  if (existingToken && !envToken) {
    const keepToken = await prompter.confirm({
      message: "访问令牌已配置，是否保留？",
      initialValue: true,
    });
    if (keepToken) {
      return existingToken;
    }
  }

  // Prompt for new token
  return String(
    await prompter.text({
      message: "Twitch OAuth 令牌（oauth:...）",
      initialValue: envToken ?? "",
      validate: (value) => {
        const raw = String(value ?? "").trim();
        if (!raw) {
          return "必填";
        }
        if (!raw.startsWith("oauth:")) {
          return "令牌应以 'oauth:' 开头";
        }
        return undefined;
      },
    }),
  ).trim();
}

/**
 * Prompt for Twitch username.
 */
async function promptUsername(
  prompter: WizardPrompter,
  account: TwitchAccountConfig | null,
): Promise<string> {
  return String(
    await prompter.text({
      message: "Twitch Bot 用户名",
      initialValue: account?.username ?? "",
      validate: (value) => (value?.trim() ? undefined : "必填"),
    }),
  ).trim();
}

/**
 * Prompt for Twitch Client ID.
 */
async function promptClientId(
  prompter: WizardPrompter,
  account: TwitchAccountConfig | null,
): Promise<string> {
  return String(
    await prompter.text({
      message: "Twitch Client ID",
      initialValue: account?.clientId ?? "",
      validate: (value) => (value?.trim() ? undefined : "必填"),
    }),
  ).trim();
}

/**
 * Prompt for optional channel name.
 */
async function promptChannelName(
  prompter: WizardPrompter,
  account: TwitchAccountConfig | null,
): Promise<string> {
  const channelName = String(
    await prompter.text({
      message: "要加入的频道",
      initialValue: account?.channel ?? "",
      validate: (value) => (value?.trim() ? undefined : "必填"),
    }),
  ).trim();
  return channelName;
}

/**
 * Prompt for token refresh credentials (client secret and refresh token).
 */
async function promptRefreshTokenSetup(
  prompter: WizardPrompter,
  account: TwitchAccountConfig | null,
): Promise<{ clientSecret?: string; refreshToken?: string }> {
  const useRefresh = await prompter.confirm({
    message: "启用自动令牌刷新（需要 Client Secret 和 Refresh Token）？",
    initialValue: Boolean(account?.clientSecret && account?.refreshToken),
  });

  if (!useRefresh) {
    return {};
  }

  const clientSecret =
    String(
      await prompter.text({
        message: "Twitch Client Secret（用于令牌刷新）",
        initialValue: account?.clientSecret ?? "",
        validate: (value) => (value?.trim() ? undefined : "必填"),
      }),
    ).trim() || undefined;

  const refreshToken =
    String(
      await prompter.text({
        message: "Twitch Refresh Token",
        initialValue: account?.refreshToken ?? "",
        validate: (value) => (value?.trim() ? undefined : "必填"),
      }),
    ).trim() || undefined;

  return { clientSecret, refreshToken };
}

/**
 * Configure with env token path (returns early if user chooses env token).
 */
async function configureWithEnvToken(
  cfg: OpenClawConfig,
  prompter: WizardPrompter,
  account: TwitchAccountConfig | null,
  envToken: string,
  forceAllowFrom: boolean,
  dmPolicy: ChannelOnboardingDmPolicy,
): Promise<{ cfg: OpenClawConfig } | null> {
  const useEnv = await prompter.confirm({
    message: "检测到 Twitch 环境变量 OPENCLAW_TWITCH_ACCESS_TOKEN，是否使用环境变量令牌？",
    initialValue: true,
  });
  if (!useEnv) {
    return null;
  }

  const username = await promptUsername(prompter, account);
  const clientId = await promptClientId(prompter, account);

  const cfgWithAccount = setTwitchAccount(cfg, {
    username,
    clientId,
    accessToken: "", // Will use env var
    enabled: true,
  });

  if (forceAllowFrom && dmPolicy.promptAllowFrom) {
    return { cfg: await dmPolicy.promptAllowFrom({ cfg: cfgWithAccount, prompter }) };
  }

  return { cfg: cfgWithAccount };
}

/**
 * Set Twitch access control (role-based)
 */
function setTwitchAccessControl(
  cfg: OpenClawConfig,
  allowedRoles: TwitchRole[],
  requireMention: boolean,
): OpenClawConfig {
  const account = getAccountConfig(cfg, DEFAULT_ACCOUNT_ID);
  if (!account) {
    return cfg;
  }

  return setTwitchAccount(cfg, {
    ...account,
    allowedRoles,
    requireMention,
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Twitch",
  channel,
  policyKey: "channels.twitch.allowedRoles", // Twitch uses roles instead of DM policy
  allowFromKey: "channels.twitch.accounts.default.allowFrom",
  getCurrent: (cfg) => {
    const account = getAccountConfig(cfg, DEFAULT_ACCOUNT_ID);
    // Map allowedRoles to policy equivalent
    if (account?.allowedRoles?.includes("all")) {
      return "open";
    }
    if (account?.allowFrom && account.allowFrom.length > 0) {
      return "allowlist";
    }
    return "disabled";
  },
  setPolicy: (cfg, policy) => {
    const allowedRoles: TwitchRole[] =
      policy === "open" ? ["all"] : policy === "allowlist" ? [] : ["moderator"];
    return setTwitchAccessControl(cfg, allowedRoles, true);
  },
  promptAllowFrom: async ({ cfg, prompter }) => {
    const account = getAccountConfig(cfg, DEFAULT_ACCOUNT_ID);
    const existingAllowFrom = account?.allowFrom ?? [];

    const entry = await prompter.text({
      message: "Twitch 白名单（用户 ID，每行一个，推荐用于安全控制）",
      placeholder: "123456789",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
    });

    const allowFrom = String(entry ?? "")
      .split(/[\n,;]+/g)
      .map((s) => s.trim())
      .filter(Boolean);

    return setTwitchAccount(cfg, {
      ...(account ?? undefined),
      allowFrom,
    });
  },
};

export const twitchOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const account = getAccountConfig(cfg, DEFAULT_ACCOUNT_ID);
    const configured = account ? isAccountConfigured(account) : false;

    return {
      channel,
      configured,
      statusLines: [`Twitch：${configured ? "已配置" : "需要用户名、令牌和 Client ID"}`],
      selectionHint: configured ? "已配置" : "需要设置",
    };
  },
  configure: async ({ cfg, prompter, forceAllowFrom }) => {
    const account = getAccountConfig(cfg, DEFAULT_ACCOUNT_ID);

    if (!account || !isAccountConfigured(account)) {
      await noteTwitchSetupHelp(prompter);
    }

    const envToken = process.env.OPENCLAW_TWITCH_ACCESS_TOKEN?.trim();

    // Check if env var is set and config is empty
    if (envToken && !account?.accessToken) {
      const envResult = await configureWithEnvToken(
        cfg,
        prompter,
        account,
        envToken,
        forceAllowFrom,
        dmPolicy,
      );
      if (envResult) {
        return envResult;
      }
    }

    // Prompt for credentials
    const username = await promptUsername(prompter, account);
    const token = await promptToken(prompter, account, envToken);
    const clientId = await promptClientId(prompter, account);
    const channelName = await promptChannelName(prompter, account);
    const { clientSecret, refreshToken } = await promptRefreshTokenSetup(prompter, account);

    const cfgWithAccount = setTwitchAccount(cfg, {
      username,
      accessToken: token,
      clientId,
      channel: channelName,
      clientSecret,
      refreshToken,
      enabled: true,
    });

    const cfgWithAllowFrom =
      forceAllowFrom && dmPolicy.promptAllowFrom
        ? await dmPolicy.promptAllowFrom({ cfg: cfgWithAccount, prompter })
        : cfgWithAccount;

    // Prompt for access control if allowFrom not set
    if (!account?.allowFrom || account.allowFrom.length === 0) {
      const accessConfig = await promptChannelAccessConfig({
        prompter,
        label: "Twitch chat",
        currentPolicy: account?.allowedRoles?.includes("all")
          ? "open"
          : account?.allowedRoles?.includes("moderator")
            ? "allowlist"
            : "disabled",
        currentEntries: [],
        placeholder: "",
        updatePrompt: false,
      });

      if (accessConfig) {
        const allowedRoles: TwitchRole[] =
          accessConfig.policy === "open"
            ? ["all"]
            : accessConfig.policy === "allowlist"
              ? ["moderator", "vip"]
              : [];

        const cfgWithAccessControl = setTwitchAccessControl(cfgWithAllowFrom, allowedRoles, true);
        return { cfg: cfgWithAccessControl };
      }
    }

    return { cfg: cfgWithAllowFrom };
  },
  dmPolicy,
  disable: (cfg) => {
    const twitch = (cfg.channels as Record<string, unknown>)?.twitch as
      | Record<string, unknown>
      | undefined;
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        twitch: { ...twitch, enabled: false },
      },
    };
  },
};

// Export helper functions for testing
export {
  promptToken,
  promptUsername,
  promptClientId,
  promptChannelName,
  promptRefreshTokenSetup,
  configureWithEnvToken,
};
