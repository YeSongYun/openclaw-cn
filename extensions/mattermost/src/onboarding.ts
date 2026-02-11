import type { ChannelOnboardingAdapter, OpenClawConfig, WizardPrompter } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";
import {
  listMattermostAccountIds,
  resolveDefaultMattermostAccountId,
  resolveMattermostAccount,
} from "./mattermost/accounts.js";
import { promptAccountId } from "./onboarding-helpers.js";

const channel = "mattermost" as const;

async function noteMattermostSetup(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Mattermost 系统控制台 -> 集成 -> Bot 账户",
      "2) 创建一个 Bot 并复制其令牌",
      "3) 使用你的服务器基础 URL（例如 https://chat.example.com）",
      "提示：Bot 必须是你希望它监控的频道的成员。",
      "文档：https://docs.openclaw.ai/channels/mattermost",
    ].join("\n"),
    "Mattermost Bot 令牌",
  );
}

export const mattermostOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listMattermostAccountIds(cfg).some((accountId) => {
      const account = resolveMattermostAccount({ cfg, accountId });
      return Boolean(account.botToken && account.baseUrl);
    });
    return {
      channel,
      configured,
      statusLines: [`Mattermost：${configured ? "已配置" : "需要令牌 + URL"}`],
      selectionHint: configured ? "已配置" : "需要设置",
      quickstartScore: configured ? 2 : 1,
    };
  },
  configure: async ({ cfg, prompter, accountOverrides, shouldPromptAccountIds }) => {
    const override = accountOverrides.mattermost?.trim();
    const defaultAccountId = resolveDefaultMattermostAccountId(cfg);
    let accountId = override ? normalizeAccountId(override) : defaultAccountId;
    if (shouldPromptAccountIds && !override) {
      accountId = await promptAccountId({
        cfg,
        prompter,
        label: "Mattermost",
        currentId: accountId,
        listAccountIds: listMattermostAccountIds,
        defaultAccountId,
      });
    }

    let next = cfg;
    const resolvedAccount = resolveMattermostAccount({
      cfg: next,
      accountId,
    });
    const accountConfigured = Boolean(resolvedAccount.botToken && resolvedAccount.baseUrl);
    const allowEnv = accountId === DEFAULT_ACCOUNT_ID;
    const canUseEnv =
      allowEnv &&
      Boolean(process.env.MATTERMOST_BOT_TOKEN?.trim()) &&
      Boolean(process.env.MATTERMOST_URL?.trim());
    const hasConfigValues =
      Boolean(resolvedAccount.config.botToken) || Boolean(resolvedAccount.config.baseUrl);

    let botToken: string | null = null;
    let baseUrl: string | null = null;

    if (!accountConfigured) {
      await noteMattermostSetup(prompter);
    }

    if (canUseEnv && !hasConfigValues) {
      const keepEnv = await prompter.confirm({
        message: "检测到 MATTERMOST_BOT_TOKEN + MATTERMOST_URL，是否使用环境变量？",
        initialValue: true,
      });
      if (keepEnv) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            mattermost: {
              ...next.channels?.mattermost,
              enabled: true,
            },
          },
        };
      } else {
        botToken = String(
          await prompter.text({
            message: "输入 Mattermost Bot 令牌",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
        baseUrl = String(
          await prompter.text({
            message: "输入 Mattermost 基础 URL",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    } else if (accountConfigured) {
      const keep = await prompter.confirm({
        message: "Mattermost 凭据已配置，是否保留？",
        initialValue: true,
      });
      if (!keep) {
        botToken = String(
          await prompter.text({
            message: "输入 Mattermost Bot 令牌",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
        baseUrl = String(
          await prompter.text({
            message: "输入 Mattermost 基础 URL",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    } else {
      botToken = String(
        await prompter.text({
          message: "Enter Mattermost bot token",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
      baseUrl = String(
        await prompter.text({
          message: "Enter Mattermost base URL",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
    }

    if (botToken || baseUrl) {
      if (accountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            mattermost: {
              ...next.channels?.mattermost,
              enabled: true,
              ...(botToken ? { botToken } : {}),
              ...(baseUrl ? { baseUrl } : {}),
            },
          },
        };
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            mattermost: {
              ...next.channels?.mattermost,
              enabled: true,
              accounts: {
                ...next.channels?.mattermost?.accounts,
                [accountId]: {
                  ...next.channels?.mattermost?.accounts?.[accountId],
                  enabled: next.channels?.mattermost?.accounts?.[accountId]?.enabled ?? true,
                  ...(botToken ? { botToken } : {}),
                  ...(baseUrl ? { baseUrl } : {}),
                },
              },
            },
          },
        };
      }
    }

    return { cfg: next, accountId };
  },
  disable: (cfg: OpenClawConfig) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      mattermost: { ...cfg.channels?.mattermost, enabled: false },
    },
  }),
};
