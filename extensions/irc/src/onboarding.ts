import {
  addWildcardAllowFrom,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  promptAccountId,
  promptChannelAccessConfig,
  type ChannelOnboardingAdapter,
  type ChannelOnboardingDmPolicy,
  type DmPolicy,
  type WizardPrompter,
} from "openclaw/plugin-sdk";
import type { CoreConfig, IrcAccountConfig, IrcNickServConfig } from "./types.js";
import { listIrcAccountIds, resolveDefaultIrcAccountId, resolveIrcAccount } from "./accounts.js";
import {
  isChannelTarget,
  normalizeIrcAllowEntry,
  normalizeIrcMessagingTarget,
} from "./normalize.js";

const channel = "irc" as const;

function parseListInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePort(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function normalizeGroupEntry(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "*") {
    return "*";
  }
  const normalized = normalizeIrcMessagingTarget(trimmed) ?? trimmed;
  if (isChannelTarget(normalized)) {
    return normalized;
  }
  return `#${normalized.replace(/^#+/, "")}`;
}

function updateIrcAccountConfig(
  cfg: CoreConfig,
  accountId: string,
  patch: Partial<IrcAccountConfig>,
): CoreConfig {
  const current = cfg.channels?.irc ?? {};
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        irc: {
          ...current,
          ...patch,
        },
      },
    };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      irc: {
        ...current,
        accounts: {
          ...current.accounts,
          [accountId]: {
            ...current.accounts?.[accountId],
            ...patch,
          },
        },
      },
    },
  };
}

function setIrcDmPolicy(cfg: CoreConfig, dmPolicy: DmPolicy): CoreConfig {
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(cfg.channels?.irc?.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      irc: {
        ...cfg.channels?.irc,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  };
}

function setIrcAllowFrom(cfg: CoreConfig, allowFrom: string[]): CoreConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      irc: {
        ...cfg.channels?.irc,
        allowFrom,
      },
    },
  };
}

function setIrcNickServ(
  cfg: CoreConfig,
  accountId: string,
  nickserv?: IrcNickServConfig,
): CoreConfig {
  return updateIrcAccountConfig(cfg, accountId, { nickserv });
}

function setIrcGroupAccess(
  cfg: CoreConfig,
  accountId: string,
  policy: "open" | "allowlist" | "disabled",
  entries: string[],
): CoreConfig {
  if (policy !== "allowlist") {
    return updateIrcAccountConfig(cfg, accountId, { enabled: true, groupPolicy: policy });
  }
  const normalizedEntries = [
    ...new Set(entries.map((entry) => normalizeGroupEntry(entry)).filter(Boolean)),
  ];
  const groups = Object.fromEntries(normalizedEntries.map((entry) => [entry, {}]));
  return updateIrcAccountConfig(cfg, accountId, {
    enabled: true,
    groupPolicy: "allowlist",
    groups,
  });
}

async function noteIrcSetupHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "IRC 需要服务器主机 + Bot 昵称。",
      "推荐：使用 TLS，端口 6697。",
      "可选：NickServ 认证/注册可在引导向导中配置。",
      '设置 channels.irc.groupPolicy="allowlist" 和 channels.irc.groups 以更严格地控制频道。',
      '注意：IRC 频道默认需要提及才会回复。要允许未提及时回复，设置 channels.irc.groups["#channel"].requireMention=false（或 "*" 表示所有频道）。',
      "支持的环境变量：IRC_HOST、IRC_PORT、IRC_TLS、IRC_NICK、IRC_USERNAME、IRC_REALNAME、IRC_PASSWORD、IRC_CHANNELS、IRC_NICKSERV_PASSWORD、IRC_NICKSERV_REGISTER_EMAIL。",
      `文档：${formatDocsLink("/channels/irc", "channels/irc")}`,
    ].join("\n"),
    "IRC 设置",
  );
}

async function promptIrcAllowFrom(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<CoreConfig> {
  const existing = params.cfg.channels?.irc?.allowFrom ?? [];

  await params.prompter.note(
    [
      "通过发送者设置 IRC 私信白名单。",
      "示例：",
      "- alice",
      "- alice!ident@example.org",
      "多个条目：用逗号分隔。",
    ].join("\n"),
    "IRC 白名单",
  );

  const raw = await params.prompter.text({
    message: "IRC 白名单（昵称或 nick!user@host）",
    placeholder: "alice, bob!ident@example.org",
    initialValue: existing[0] ? String(existing[0]) : undefined,
    validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
  });

  const parsed = parseListInput(String(raw));
  const normalized = [
    ...new Set(
      parsed
        .map((entry) => normalizeIrcAllowEntry(entry))
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
  return setIrcAllowFrom(params.cfg, normalized);
}

async function promptIrcNickServConfig(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<CoreConfig> {
  const resolved = resolveIrcAccount({ cfg: params.cfg, accountId: params.accountId });
  const existing = resolved.config.nickserv;
  const hasExisting = Boolean(existing?.password || existing?.passwordFile);
  const wants = await params.prompter.confirm({
    message: hasExisting ? "更新 NickServ 设置？" : "配置 NickServ 认证/注册？",
    initialValue: hasExisting,
  });
  if (!wants) {
    return params.cfg;
  }

  const service = String(
    await params.prompter.text({
      message: "NickServ 服务昵称",
      initialValue: existing?.service || "NickServ",
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    }),
  ).trim();

  const useEnvPassword =
    params.accountId === DEFAULT_ACCOUNT_ID &&
    Boolean(process.env.IRC_NICKSERV_PASSWORD?.trim()) &&
    !(existing?.password || existing?.passwordFile)
      ? await params.prompter.confirm({
          message: "检测到 IRC_NICKSERV_PASSWORD，是否使用环境变量？",
          initialValue: true,
        })
      : false;

  const password = useEnvPassword
    ? undefined
    : String(
        await params.prompter.text({
          message: "NickServ 密码（留空以禁用 NickServ 认证）",
          validate: () => undefined,
        }),
      ).trim();

  if (!password && !useEnvPassword) {
    return setIrcNickServ(params.cfg, params.accountId, {
      enabled: false,
      service,
    });
  }

  const register = await params.prompter.confirm({
    message: "连接时发送 NickServ REGISTER？",
    initialValue: existing?.register ?? false,
  });
  const registerEmail = register
    ? String(
        await params.prompter.text({
          message: "NickServ 注册邮箱",
          initialValue:
            existing?.registerEmail ||
            (params.accountId === DEFAULT_ACCOUNT_ID
              ? process.env.IRC_NICKSERV_REGISTER_EMAIL
              : undefined),
          validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
        }),
      ).trim()
    : undefined;

  return setIrcNickServ(params.cfg, params.accountId, {
    enabled: true,
    service,
    ...(password ? { password } : {}),
    register,
    ...(registerEmail ? { registerEmail } : {}),
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "IRC",
  channel,
  policyKey: "channels.irc.dmPolicy",
  allowFromKey: "channels.irc.allowFrom",
  getCurrent: (cfg) => (cfg as CoreConfig).channels?.irc?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setIrcDmPolicy(cfg as CoreConfig, policy),
  promptAllowFrom: promptIrcAllowFrom,
};

export const ircOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const coreCfg = cfg as CoreConfig;
    const configured = listIrcAccountIds(coreCfg).some(
      (accountId) => resolveIrcAccount({ cfg: coreCfg, accountId }).configured,
    );
    return {
      channel,
      configured,
      statusLines: [`IRC：${configured ? "已配置" : "需要主机 + 昵称"}`],
      selectionHint: configured ? "已配置" : "需要主机 + 昵称",
      quickstartScore: configured ? 1 : 0,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    let next = cfg as CoreConfig;
    const ircOverride = accountOverrides.irc?.trim();
    const defaultAccountId = resolveDefaultIrcAccountId(next);
    let accountId = ircOverride || defaultAccountId;
    if (shouldPromptAccountIds && !ircOverride) {
      accountId = await promptAccountId({
        cfg: next,
        prompter,
        label: "IRC",
        currentId: accountId,
        listAccountIds: listIrcAccountIds,
        defaultAccountId,
      });
    }

    const resolved = resolveIrcAccount({ cfg: next, accountId });
    const isDefaultAccount = accountId === DEFAULT_ACCOUNT_ID;
    const envHost = isDefaultAccount ? process.env.IRC_HOST?.trim() : "";
    const envNick = isDefaultAccount ? process.env.IRC_NICK?.trim() : "";
    const envReady = Boolean(envHost && envNick);

    if (!resolved.configured) {
      await noteIrcSetupHelp(prompter);
    }

    let useEnv = false;
    if (envReady && isDefaultAccount && !resolved.config.host && !resolved.config.nick) {
      useEnv = await prompter.confirm({
        message: "检测到 IRC_HOST 和 IRC_NICK，是否使用环境变量？",
        initialValue: true,
      });
    }

    if (useEnv) {
      next = updateIrcAccountConfig(next, accountId, { enabled: true });
    } else {
      const host = String(
        await prompter.text({
          message: "IRC 服务器主机",
          initialValue: resolved.config.host || envHost || undefined,
          validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
        }),
      ).trim();

      const tls = await prompter.confirm({
        message: "IRC 是否使用 TLS？",
        initialValue: resolved.config.tls ?? true,
      });
      const defaultPort = resolved.config.port ?? (tls ? 6697 : 6667);
      const portInput = await prompter.text({
        message: "IRC 服务器端口",
        initialValue: String(defaultPort),
        validate: (value) => {
          const parsed = Number.parseInt(String(value ?? "").trim(), 10);
          return Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535
            ? undefined
            : "请使用 1 到 65535 之间的端口";
        },
      });
      const port = parsePort(String(portInput), defaultPort);

      const nick = String(
        await prompter.text({
          message: "IRC 昵称",
          initialValue: resolved.config.nick || envNick || undefined,
          validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
        }),
      ).trim();

      const username = String(
        await prompter.text({
          message: "IRC 用户名",
          initialValue: resolved.config.username || nick || "openclaw",
          validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
        }),
      ).trim();

      const realname = String(
        await prompter.text({
          message: "IRC 真实姓名",
          initialValue: resolved.config.realname || "OpenClaw",
          validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
        }),
      ).trim();

      const channelsRaw = await prompter.text({
        message: "自动加入的 IRC 频道（可选，逗号分隔）",
        placeholder: "#openclaw, #ops",
        initialValue: (resolved.config.channels ?? []).join(", "),
      });
      const channels = [
        ...new Set(
          parseListInput(String(channelsRaw))
            .map((entry) => normalizeGroupEntry(entry))
            .filter((entry): entry is string => Boolean(entry && entry !== "*"))
            .filter((entry) => isChannelTarget(entry)),
        ),
      ];

      next = updateIrcAccountConfig(next, accountId, {
        enabled: true,
        host,
        port,
        tls,
        nick,
        username,
        realname,
        channels: channels.length > 0 ? channels : undefined,
      });
    }

    const afterConfig = resolveIrcAccount({ cfg: next, accountId });
    const accessConfig = await promptChannelAccessConfig({
      prompter,
      label: "IRC channels",
      currentPolicy: afterConfig.config.groupPolicy ?? "allowlist",
      currentEntries: Object.keys(afterConfig.config.groups ?? {}),
      placeholder: "#openclaw, #ops, *",
      updatePrompt: Boolean(afterConfig.config.groups),
    });
    if (accessConfig) {
      next = setIrcGroupAccess(next, accountId, accessConfig.policy, accessConfig.entries);

      // Mention gating: groups/channels are mention-gated by default. Make this explicit in onboarding.
      const wantsMentions = await prompter.confirm({
        message: "在 IRC 频道中是否需要 @提及 才回复？",
        initialValue: true,
      });
      if (!wantsMentions) {
        const resolvedAfter = resolveIrcAccount({ cfg: next, accountId });
        const groups = resolvedAfter.config.groups ?? {};
        const patched = Object.fromEntries(
          Object.entries(groups).map(([key, value]) => [key, { ...value, requireMention: false }]),
        );
        next = updateIrcAccountConfig(next, accountId, { groups: patched });
      }
    }

    if (forceAllowFrom) {
      next = await promptIrcAllowFrom({ cfg: next, prompter, accountId });
    }
    next = await promptIrcNickServConfig({
      cfg: next,
      prompter,
      accountId,
    });

    await prompter.note(
      [
        "下一步：重启网关并验证状态。",
        "命令：openclaw channels status --probe",
        `文档：${formatDocsLink("/channels/irc", "channels/irc")}`,
      ].join("\n"),
      "IRC 后续步骤",
    );

    return { cfg: next, accountId };
  },
  dmPolicy,
  disable: (cfg) => ({
    ...(cfg as CoreConfig),
    channels: {
      ...(cfg as CoreConfig).channels,
      irc: {
        ...(cfg as CoreConfig).channels?.irc,
        enabled: false,
      },
    },
  }),
};
