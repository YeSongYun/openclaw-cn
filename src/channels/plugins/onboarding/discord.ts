import type { OpenClawConfig } from "../../../config/config.js";
import type { DiscordGuildEntry } from "../../../config/types.discord.js";
import type { DmPolicy } from "../../../config/types.js";
import type { WizardPrompter } from "../../../wizard/prompts.js";
import type { ChannelOnboardingAdapter, ChannelOnboardingDmPolicy } from "../onboarding-types.js";
import {
  listDiscordAccountIds,
  resolveDefaultDiscordAccountId,
  resolveDiscordAccount,
} from "../../../discord/accounts.js";
import { normalizeDiscordSlug } from "../../../discord/monitor/allow-list.js";
import {
  resolveDiscordChannelAllowlist,
  type DiscordChannelResolution,
} from "../../../discord/resolve-channels.js";
import { resolveDiscordUserAllowlist } from "../../../discord/resolve-users.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../routing/session-key.js";
import { formatDocsLink } from "../../../terminal/links.js";
import { promptChannelAccessConfig } from "./channel-access.js";
import { addWildcardAllowFrom, promptAccountId } from "./helpers.js";

const channel = "discord" as const;

function setDiscordDmPolicy(cfg: OpenClawConfig, dmPolicy: DmPolicy) {
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(cfg.channels?.discord?.dm?.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      discord: {
        ...cfg.channels?.discord,
        dm: {
          ...cfg.channels?.discord?.dm,
          enabled: cfg.channels?.discord?.dm?.enabled ?? true,
          policy: dmPolicy,
          ...(allowFrom ? { allowFrom } : {}),
        },
      },
    },
  };
}

async function noteDiscordTokenHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Discord 开发者门户 → 应用 → 新建应用",
      "2) 机器人 → 添加机器人 → 重置令牌 → 复制令牌",
      "3) OAuth2 → URL 生成器 → 范围选择 'bot' → 邀请到你的服务器",
      "提示：如果需要消息文本，请启用 Message Content Intent。（机器人 → 特权网关 Intents → Message Content Intent）",
      `文档：${formatDocsLink("/discord", "discord")}`,
    ].join("\n"),
    "Discord 机器人令牌",
  );
}

function setDiscordGroupPolicy(
  cfg: OpenClawConfig,
  accountId: string,
  groupPolicy: "open" | "allowlist" | "disabled",
): OpenClawConfig {
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        discord: {
          ...cfg.channels?.discord,
          enabled: true,
          groupPolicy,
        },
      },
    };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      discord: {
        ...cfg.channels?.discord,
        enabled: true,
        accounts: {
          ...cfg.channels?.discord?.accounts,
          [accountId]: {
            ...cfg.channels?.discord?.accounts?.[accountId],
            enabled: cfg.channels?.discord?.accounts?.[accountId]?.enabled ?? true,
            groupPolicy,
          },
        },
      },
    },
  };
}

function setDiscordGuildChannelAllowlist(
  cfg: OpenClawConfig,
  accountId: string,
  entries: Array<{
    guildKey: string;
    channelKey?: string;
  }>,
): OpenClawConfig {
  const baseGuilds =
    accountId === DEFAULT_ACCOUNT_ID
      ? (cfg.channels?.discord?.guilds ?? {})
      : (cfg.channels?.discord?.accounts?.[accountId]?.guilds ?? {});
  const guilds: Record<string, DiscordGuildEntry> = { ...baseGuilds };
  for (const entry of entries) {
    const guildKey = entry.guildKey || "*";
    const existing = guilds[guildKey] ?? {};
    if (entry.channelKey) {
      const channels = { ...existing.channels };
      channels[entry.channelKey] = { allow: true };
      guilds[guildKey] = { ...existing, channels };
    } else {
      guilds[guildKey] = existing;
    }
  }
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        discord: {
          ...cfg.channels?.discord,
          enabled: true,
          guilds,
        },
      },
    };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      discord: {
        ...cfg.channels?.discord,
        enabled: true,
        accounts: {
          ...cfg.channels?.discord?.accounts,
          [accountId]: {
            ...cfg.channels?.discord?.accounts?.[accountId],
            enabled: cfg.channels?.discord?.accounts?.[accountId]?.enabled ?? true,
            guilds,
          },
        },
      },
    },
  };
}

function setDiscordAllowFrom(cfg: OpenClawConfig, allowFrom: string[]): OpenClawConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      discord: {
        ...cfg.channels?.discord,
        dm: {
          ...cfg.channels?.discord?.dm,
          enabled: cfg.channels?.discord?.dm?.enabled ?? true,
          allowFrom,
        },
      },
    },
  };
}

function parseDiscordAllowFromInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function promptDiscordAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  const accountId =
    params.accountId && normalizeAccountId(params.accountId)
      ? (normalizeAccountId(params.accountId) ?? DEFAULT_ACCOUNT_ID)
      : resolveDefaultDiscordAccountId(params.cfg);
  const resolved = resolveDiscordAccount({ cfg: params.cfg, accountId });
  const token = resolved.token;
  const existing = params.cfg.channels?.discord?.dm?.allowFrom ?? [];
  await params.prompter.note(
    [
      "通过用户名将 Discord 私信加入白名单（我们会解析为用户 ID）。",
      "示例：",
      "- 123456789012345678",
      "- @alice",
      "- alice#1234",
      "多个条目：逗号分隔。",
      `文档：${formatDocsLink("/discord", "discord")}`,
    ].join("\n"),
    "Discord 白名单",
  );

  const parseInputs = (value: string) => parseDiscordAllowFromInput(value);
  const parseId = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const mention = trimmed.match(/^<@!?(\d+)>$/);
    if (mention) {
      return mention[1];
    }
    const prefixed = trimmed.replace(/^(user:|discord:)/i, "");
    if (/^\d+$/.test(prefixed)) {
      return prefixed;
    }
    return null;
  };

  while (true) {
    const entry = await params.prompter.text({
      message: "Discord 白名单（用户名或 ID）",
      placeholder: "@alice, 123456789012345678",
      initialValue: existing[0] ? String(existing[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });
    const parts = parseInputs(String(entry));
    if (!token) {
      const ids = parts.map(parseId).filter(Boolean) as string[];
      if (ids.length !== parts.length) {
        await params.prompter.note(
          "机器人令牌缺失；请仅使用数字用户 ID（或提及格式）。",
          "Discord 白名单",
        );
        continue;
      }
      const unique = [...new Set([...existing.map((v) => String(v).trim()), ...ids])].filter(
        Boolean,
      );
      return setDiscordAllowFrom(params.cfg, unique);
    }

    const results = await resolveDiscordUserAllowlist({
      token,
      entries: parts,
    }).catch(() => null);
    if (!results) {
      await params.prompter.note("解析用户名失败。请重试。", "Discord 白名单");
      continue;
    }
    const unresolved = results.filter((res) => !res.resolved || !res.id);
    if (unresolved.length > 0) {
      await params.prompter.note(
        `无法解析：${unresolved.map((res) => res.input).join(", ")}`,
        "Discord 白名单",
      );
      continue;
    }
    const ids = results.map((res) => res.id as string);
    const unique = [...new Set([...existing.map((v) => String(v).trim()).filter(Boolean), ...ids])];
    return setDiscordAllowFrom(params.cfg, unique);
  }
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Discord",
  channel,
  policyKey: "channels.discord.dm.policy",
  allowFromKey: "channels.discord.dm.allowFrom",
  getCurrent: (cfg) => cfg.channels?.discord?.dm?.policy ?? "pairing",
  setPolicy: (cfg, policy) => setDiscordDmPolicy(cfg, policy),
  promptAllowFrom: promptDiscordAllowFrom,
};

export const discordOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listDiscordAccountIds(cfg).some((accountId) =>
      Boolean(resolveDiscordAccount({ cfg, accountId }).token),
    );
    return {
      channel,
      configured,
      statusLines: [`Discord：${configured ? "已配置" : "需要令牌"}`],
      selectionHint: configured ? "已配置" : "需要令牌",
      quickstartScore: configured ? 2 : 1,
    };
  },
  configure: async ({ cfg, prompter, accountOverrides, shouldPromptAccountIds }) => {
    const discordOverride = accountOverrides.discord?.trim();
    const defaultDiscordAccountId = resolveDefaultDiscordAccountId(cfg);
    let discordAccountId = discordOverride
      ? normalizeAccountId(discordOverride)
      : defaultDiscordAccountId;
    if (shouldPromptAccountIds && !discordOverride) {
      discordAccountId = await promptAccountId({
        cfg,
        prompter,
        label: "Discord",
        currentId: discordAccountId,
        listAccountIds: listDiscordAccountIds,
        defaultAccountId: defaultDiscordAccountId,
      });
    }

    let next = cfg;
    const resolvedAccount = resolveDiscordAccount({
      cfg: next,
      accountId: discordAccountId,
    });
    const accountConfigured = Boolean(resolvedAccount.token);
    const allowEnv = discordAccountId === DEFAULT_ACCOUNT_ID;
    const canUseEnv = allowEnv && Boolean(process.env.DISCORD_BOT_TOKEN?.trim());
    const hasConfigToken = Boolean(resolvedAccount.config.token);

    let token: string | null = null;
    if (!accountConfigured) {
      await noteDiscordTokenHelp(prompter);
    }
    if (canUseEnv && !resolvedAccount.config.token) {
      const keepEnv = await prompter.confirm({
        message: "检测到 DISCORD_BOT_TOKEN。使用环境变量？",
        initialValue: true,
      });
      if (keepEnv) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            discord: { ...next.channels?.discord, enabled: true },
          },
        };
      } else {
        token = String(
          await prompter.text({
            message: "输入 Discord 机器人令牌",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    } else if (hasConfigToken) {
      const keep = await prompter.confirm({
        message: "Discord 令牌已配置。保留吗？",
        initialValue: true,
      });
      if (!keep) {
        token = String(
          await prompter.text({
            message: "输入 Discord 机器人令牌",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    } else {
      token = String(
        await prompter.text({
          message: "Enter Discord bot token",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
    }

    if (token) {
      if (discordAccountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            discord: { ...next.channels?.discord, enabled: true, token },
          },
        };
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            discord: {
              ...next.channels?.discord,
              enabled: true,
              accounts: {
                ...next.channels?.discord?.accounts,
                [discordAccountId]: {
                  ...next.channels?.discord?.accounts?.[discordAccountId],
                  enabled: next.channels?.discord?.accounts?.[discordAccountId]?.enabled ?? true,
                  token,
                },
              },
            },
          },
        };
      }
    }

    const currentEntries = Object.entries(resolvedAccount.config.guilds ?? {}).flatMap(
      ([guildKey, value]) => {
        const channels = value?.channels ?? {};
        const channelKeys = Object.keys(channels);
        if (channelKeys.length === 0) {
          return [guildKey];
        }
        return channelKeys.map((channelKey) => `${guildKey}/${channelKey}`);
      },
    );
    const accessConfig = await promptChannelAccessConfig({
      prompter,
      label: "Discord 频道",
      currentPolicy: resolvedAccount.config.groupPolicy ?? "allowlist",
      currentEntries,
      placeholder: "My Server/#general, guildId/channelId, #support",
      updatePrompt: Boolean(resolvedAccount.config.guilds),
    });
    if (accessConfig) {
      if (accessConfig.policy !== "allowlist") {
        next = setDiscordGroupPolicy(next, discordAccountId, accessConfig.policy);
      } else {
        const accountWithTokens = resolveDiscordAccount({
          cfg: next,
          accountId: discordAccountId,
        });
        let resolved: DiscordChannelResolution[] = accessConfig.entries.map((input) => ({
          input,
          resolved: false,
        }));
        if (accountWithTokens.token && accessConfig.entries.length > 0) {
          try {
            resolved = await resolveDiscordChannelAllowlist({
              token: accountWithTokens.token,
              entries: accessConfig.entries,
            });
            const resolvedChannels = resolved.filter((entry) => entry.resolved && entry.channelId);
            const resolvedGuilds = resolved.filter(
              (entry) => entry.resolved && entry.guildId && !entry.channelId,
            );
            const unresolved = resolved
              .filter((entry) => !entry.resolved)
              .map((entry) => entry.input);
            if (resolvedChannels.length > 0 || resolvedGuilds.length > 0 || unresolved.length > 0) {
              const summary: string[] = [];
              if (resolvedChannels.length > 0) {
                summary.push(
                  `已解析频道：${resolvedChannels
                    .map((entry) => entry.channelId)
                    .filter(Boolean)
                    .join(", ")}`,
                );
              }
              if (resolvedGuilds.length > 0) {
                summary.push(
                  `已解析服务器：${resolvedGuilds
                    .map((entry) => entry.guildId)
                    .filter(Boolean)
                    .join(", ")}`,
                );
              }
              if (unresolved.length > 0) {
                summary.push(`未解析（保留原样）：${unresolved.join(", ")}`);
              }
              await prompter.note(summary.join("\n"), "Discord 频道");
            }
          } catch (err) {
            await prompter.note(
              `频道查找失败；保留原始输入。${String(err)}`,
              "Discord 频道",
            );
          }
        }
        const allowlistEntries: Array<{ guildKey: string; channelKey?: string }> = [];
        for (const entry of resolved) {
          const guildKey =
            entry.guildId ??
            (entry.guildName ? normalizeDiscordSlug(entry.guildName) : undefined) ??
            "*";
          const channelKey =
            entry.channelId ??
            (entry.channelName ? normalizeDiscordSlug(entry.channelName) : undefined);
          if (!channelKey && guildKey === "*") {
            continue;
          }
          allowlistEntries.push({ guildKey, ...(channelKey ? { channelKey } : {}) });
        }
        next = setDiscordGroupPolicy(next, discordAccountId, "allowlist");
        next = setDiscordGuildChannelAllowlist(next, discordAccountId, allowlistEntries);
      }
    }

    return { cfg: next, accountId: discordAccountId };
  },
  dmPolicy,
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      discord: { ...cfg.channels?.discord, enabled: false },
    },
  }),
};
