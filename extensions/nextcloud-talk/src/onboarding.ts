import {
  addWildcardAllowFrom,
  formatDocsLink,
  promptAccountId,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  type ChannelOnboardingAdapter,
  type ChannelOnboardingDmPolicy,
  type OpenClawConfig,
  type WizardPrompter,
} from "openclaw/plugin-sdk";
import type { CoreConfig, DmPolicy } from "./types.js";
import {
  listNextcloudTalkAccountIds,
  resolveDefaultNextcloudTalkAccountId,
  resolveNextcloudTalkAccount,
} from "./accounts.js";

const channel = "nextcloud-talk" as const;

function setNextcloudTalkDmPolicy(cfg: CoreConfig, dmPolicy: DmPolicy): CoreConfig {
  const existingConfig = cfg.channels?.["nextcloud-talk"];
  const existingAllowFrom: string[] = (existingConfig?.allowFrom ?? []).map((x) => String(x));
  const allowFrom: string[] =
    dmPolicy === "open" ? (addWildcardAllowFrom(existingAllowFrom) as string[]) : existingAllowFrom;

  const newNextcloudTalkConfig = {
    ...existingConfig,
    dmPolicy,
    allowFrom,
  };

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      "nextcloud-talk": newNextcloudTalkConfig,
    },
  } as CoreConfig;
}

async function noteNextcloudTalkSecretHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) SSH 登录到你的 Nextcloud 服务器",
      '2) 运行：./occ talk:bot:install "OpenClaw" "<shared-secret>" "<webhook-url>" --feature reaction',
      "3) 复制你在命令中使用的共享密钥",
      "4) 在 Nextcloud Talk 房间设置中启用机器人",
      "提示：你也可以在环境变量中设置 NEXTCLOUD_TALK_BOT_SECRET。",
      `Docs: ${formatDocsLink("/channels/nextcloud-talk", "channels/nextcloud-talk")}`,
    ].join("\n"),
    "Nextcloud Talk 机器人设置",
  );
}

async function noteNextcloudTalkUserIdHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) 在 Nextcloud 管理面板中查看用户 ID",
      "2) 或查看有人发消息时的 Webhook 负载日志",
      "3) 用户 ID 通常是 Nextcloud 中的小写用户名",
      `Docs: ${formatDocsLink("/channels/nextcloud-talk", "channels/nextcloud-talk")}`,
    ].join("\n"),
    "Nextcloud Talk 用户 ID",
  );
}

async function promptNextcloudTalkAllowFrom(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<CoreConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveNextcloudTalkAccount({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  await noteNextcloudTalkUserIdHelp(prompter);

  const parseInput = (value: string) =>
    value
      .split(/[\n,;]+/g)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

  let resolvedIds: string[] = [];
  while (resolvedIds.length === 0) {
    const entry = await prompter.text({
      message: "Nextcloud Talk 白名单（用户 ID）",
      placeholder: "username",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });
    resolvedIds = parseInput(String(entry));
    if (resolvedIds.length === 0) {
      await prompter.note("请输入至少一个有效的用户 ID。", "Nextcloud Talk 白名单");
    }
  }

  const merged = [
    ...existingAllowFrom.map((item) => String(item).trim().toLowerCase()).filter(Boolean),
    ...resolvedIds,
  ];
  const unique = [...new Set(merged)];

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        "nextcloud-talk": {
          ...cfg.channels?.["nextcloud-talk"],
          enabled: true,
          dmPolicy: "allowlist",
          allowFrom: unique,
        },
      },
    };
  }

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      "nextcloud-talk": {
        ...cfg.channels?.["nextcloud-talk"],
        enabled: true,
        accounts: {
          ...cfg.channels?.["nextcloud-talk"]?.accounts,
          [accountId]: {
            ...cfg.channels?.["nextcloud-talk"]?.accounts?.[accountId],
            enabled: cfg.channels?.["nextcloud-talk"]?.accounts?.[accountId]?.enabled ?? true,
            dmPolicy: "allowlist",
            allowFrom: unique,
          },
        },
      },
    },
  };
}

async function promptNextcloudTalkAllowFromForAccount(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<CoreConfig> {
  const accountId =
    params.accountId && normalizeAccountId(params.accountId)
      ? (normalizeAccountId(params.accountId) ?? DEFAULT_ACCOUNT_ID)
      : resolveDefaultNextcloudTalkAccountId(params.cfg);
  return promptNextcloudTalkAllowFrom({
    cfg: params.cfg,
    prompter: params.prompter,
    accountId,
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Nextcloud Talk",
  channel,
  policyKey: "channels.nextcloud-talk.dmPolicy",
  allowFromKey: "channels.nextcloud-talk.allowFrom",
  getCurrent: (cfg) => cfg.channels?.["nextcloud-talk"]?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setNextcloudTalkDmPolicy(cfg as CoreConfig, policy as DmPolicy),
  promptAllowFrom: promptNextcloudTalkAllowFromForAccount as (params: {
    cfg: OpenClawConfig;
    prompter: WizardPrompter;
    accountId?: string | undefined;
  }) => Promise<OpenClawConfig>,
};

export const nextcloudTalkOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listNextcloudTalkAccountIds(cfg as CoreConfig).some((accountId) => {
      const account = resolveNextcloudTalkAccount({ cfg: cfg as CoreConfig, accountId });
      return Boolean(account.secret && account.baseUrl);
    });
    return {
      channel,
      configured,
      statusLines: [`Nextcloud Talk：${configured ? "已配置" : "需要设置"}`],
      selectionHint: configured ? "已配置" : "自托管聊天",
      quickstartScore: configured ? 1 : 5,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const nextcloudTalkOverride = accountOverrides["nextcloud-talk"]?.trim();
    const defaultAccountId = resolveDefaultNextcloudTalkAccountId(cfg as CoreConfig);
    let accountId = nextcloudTalkOverride
      ? normalizeAccountId(nextcloudTalkOverride)
      : defaultAccountId;

    if (shouldPromptAccountIds && !nextcloudTalkOverride) {
      accountId = await promptAccountId({
        cfg: cfg as CoreConfig,
        prompter,
        label: "Nextcloud Talk",
        currentId: accountId,
        listAccountIds: listNextcloudTalkAccountIds as (cfg: OpenClawConfig) => string[],
        defaultAccountId,
      });
    }

    let next = cfg as CoreConfig;
    const resolvedAccount = resolveNextcloudTalkAccount({
      cfg: next,
      accountId,
    });
    const accountConfigured = Boolean(resolvedAccount.secret && resolvedAccount.baseUrl);
    const allowEnv = accountId === DEFAULT_ACCOUNT_ID;
    const canUseEnv = allowEnv && Boolean(process.env.NEXTCLOUD_TALK_BOT_SECRET?.trim());
    const hasConfigSecret = Boolean(
      resolvedAccount.config.botSecret || resolvedAccount.config.botSecretFile,
    );

    let baseUrl = resolvedAccount.baseUrl;
    if (!baseUrl) {
      baseUrl = String(
        await prompter.text({
          message: "输入 Nextcloud 实例 URL（例如 https://cloud.example.com）",
          validate: (value) => {
            const v = String(value ?? "").trim();
            if (!v) {
              return "必填";
            }
            if (!v.startsWith("http://") && !v.startsWith("https://")) {
              return "URL 必须以 http:// 或 https:// 开头";
            }
            return undefined;
          },
        }),
      ).trim();
    }

    let secret: string | null = null;
    if (!accountConfigured) {
      await noteNextcloudTalkSecretHelp(prompter);
    }

    if (canUseEnv && !resolvedAccount.config.botSecret) {
      const keepEnv = await prompter.confirm({
        message: "检测到 NEXTCLOUD_TALK_BOT_SECRET。是否使用环境变量？",
        initialValue: true,
      });
      if (keepEnv) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            "nextcloud-talk": {
              ...next.channels?.["nextcloud-talk"],
              enabled: true,
              baseUrl,
            },
          },
        };
      } else {
        secret = String(
          await prompter.text({
            message: "输入 Nextcloud Talk 机器人密钥",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    } else if (hasConfigSecret) {
      const keep = await prompter.confirm({
        message: "Nextcloud Talk 密钥已配置。是否保留？",
        initialValue: true,
      });
      if (!keep) {
        secret = String(
          await prompter.text({
            message: "输入 Nextcloud Talk 机器人密钥",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    } else {
      secret = String(
        await prompter.text({
          message: "输入 Nextcloud Talk 机器人密钥",
          validate: (value) => (value?.trim() ? undefined : "必填"),
        }),
      ).trim();
    }

    if (secret || baseUrl !== resolvedAccount.baseUrl) {
      if (accountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            "nextcloud-talk": {
              ...next.channels?.["nextcloud-talk"],
              enabled: true,
              baseUrl,
              ...(secret ? { botSecret: secret } : {}),
            },
          },
        };
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            "nextcloud-talk": {
              ...next.channels?.["nextcloud-talk"],
              enabled: true,
              accounts: {
                ...next.channels?.["nextcloud-talk"]?.accounts,
                [accountId]: {
                  ...next.channels?.["nextcloud-talk"]?.accounts?.[accountId],
                  enabled:
                    next.channels?.["nextcloud-talk"]?.accounts?.[accountId]?.enabled ?? true,
                  baseUrl,
                  ...(secret ? { botSecret: secret } : {}),
                },
              },
            },
          },
        };
      }
    }

    if (forceAllowFrom) {
      next = await promptNextcloudTalkAllowFrom({
        cfg: next,
        prompter,
        accountId,
      });
    }

    return { cfg: next, accountId };
  },
  dmPolicy,
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      "nextcloud-talk": { ...cfg.channels?.["nextcloud-talk"], enabled: false },
    },
  }),
};
