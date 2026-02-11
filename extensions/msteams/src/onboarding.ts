import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  OpenClawConfig,
  DmPolicy,
  WizardPrompter,
  MSTeamsTeamConfig,
} from "openclaw/plugin-sdk";
import {
  addWildcardAllowFrom,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  promptChannelAccessConfig,
} from "openclaw/plugin-sdk";
import {
  parseMSTeamsTeamEntry,
  resolveMSTeamsChannelAllowlist,
  resolveMSTeamsUserAllowlist,
} from "./resolve-allowlist.js";
import { resolveMSTeamsCredentials } from "./token.js";

const channel = "msteams" as const;

function setMSTeamsDmPolicy(cfg: OpenClawConfig, dmPolicy: DmPolicy) {
  const allowFrom =
    dmPolicy === "open"
      ? addWildcardAllowFrom(cfg.channels?.msteams?.allowFrom)?.map((entry) => String(entry))
      : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      msteams: {
        ...cfg.channels?.msteams,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  };
}

function setMSTeamsAllowFrom(cfg: OpenClawConfig, allowFrom: string[]): OpenClawConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      msteams: {
        ...cfg.channels?.msteams,
        allowFrom,
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

function looksLikeGuid(value: string): boolean {
  return /^[0-9a-fA-F-]{16,}$/.test(value);
}

async function promptMSTeamsAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
}): Promise<OpenClawConfig> {
  const existing = params.cfg.channels?.msteams?.allowFrom ?? [];
  await params.prompter.note(
    [
      "通过显示名称、UPN/邮箱或用户 ID 设置 MS Teams 私信白名单。",
      "当凭据允许时，我们会通过 Microsoft Graph 将名称解析为用户 ID。",
      "示例：",
      "- alex@example.com",
      "- Alex Johnson",
      "- 00000000-0000-0000-0000-000000000000",
    ].join("\n"),
    "MS Teams 白名单",
  );

  while (true) {
    const entry = await params.prompter.text({
      message: "MS Teams 白名单（用户名或 ID）",
      placeholder: "alex@example.com, Alex Johnson",
      initialValue: existing[0] ? String(existing[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });
    const parts = parseAllowFromInput(String(entry));
    if (parts.length === 0) {
      await params.prompter.note("请至少输入一个用户。", "MS Teams 白名单");
      continue;
    }

    const resolved = await resolveMSTeamsUserAllowlist({
      cfg: params.cfg,
      entries: parts,
    }).catch(() => null);

    if (!resolved) {
      const ids = parts.filter((part) => looksLikeGuid(part));
      if (ids.length !== parts.length) {
        await params.prompter.note(
          "Graph 查询不可用，请仅使用用户 ID。",
          "MS Teams 白名单",
        );
        continue;
      }
      const unique = [
        ...new Set([...existing.map((v) => String(v).trim()).filter(Boolean), ...ids]),
      ];
      return setMSTeamsAllowFrom(params.cfg, unique);
    }

    const unresolved = resolved.filter((item) => !item.resolved || !item.id);
    if (unresolved.length > 0) {
      await params.prompter.note(
        `无法解析：${unresolved.map((item) => item.input).join(", ")}`,
        "MS Teams 白名单",
      );
      continue;
    }

    const ids = resolved.map((item) => item.id as string);
    const unique = [...new Set([...existing.map((v) => String(v).trim()).filter(Boolean), ...ids])];
    return setMSTeamsAllowFrom(params.cfg, unique);
  }
}

async function noteMSTeamsCredentialHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Azure Bot 注册 → 获取 App ID + Tenant ID",
      "2) 添加客户端密钥（App Password）",
      "3) 设置 Webhook URL + 消息端点",
      "提示：你也可以设置 MSTEAMS_APP_ID / MSTEAMS_APP_PASSWORD / MSTEAMS_TENANT_ID 环境变量。",
      `文档：${formatDocsLink("/channels/msteams", "msteams")}`,
    ].join("\n"),
    "MS Teams 凭据",
  );
}

function setMSTeamsGroupPolicy(
  cfg: OpenClawConfig,
  groupPolicy: "open" | "allowlist" | "disabled",
): OpenClawConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      msteams: {
        ...cfg.channels?.msteams,
        enabled: true,
        groupPolicy,
      },
    },
  };
}

function setMSTeamsTeamsAllowlist(
  cfg: OpenClawConfig,
  entries: Array<{ teamKey: string; channelKey?: string }>,
): OpenClawConfig {
  const baseTeams = cfg.channels?.msteams?.teams ?? {};
  const teams: Record<string, { channels?: Record<string, unknown> }> = { ...baseTeams };
  for (const entry of entries) {
    const teamKey = entry.teamKey;
    if (!teamKey) {
      continue;
    }
    const existing = teams[teamKey] ?? {};
    if (entry.channelKey) {
      const channels = { ...existing.channels };
      channels[entry.channelKey] = channels[entry.channelKey] ?? {};
      teams[teamKey] = { ...existing, channels };
    } else {
      teams[teamKey] = existing;
    }
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      msteams: {
        ...cfg.channels?.msteams,
        enabled: true,
        teams: teams as Record<string, MSTeamsTeamConfig>,
      },
    },
  };
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "MS Teams",
  channel,
  policyKey: "channels.msteams.dmPolicy",
  allowFromKey: "channels.msteams.allowFrom",
  getCurrent: (cfg) => cfg.channels?.msteams?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setMSTeamsDmPolicy(cfg, policy),
  promptAllowFrom: promptMSTeamsAllowFrom,
};

export const msteamsOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = Boolean(resolveMSTeamsCredentials(cfg.channels?.msteams));
    return {
      channel,
      configured,
      statusLines: [`MS Teams：${configured ? "已配置" : "需要应用凭据"}`],
      selectionHint: configured ? "已配置" : "需要应用凭据",
      quickstartScore: configured ? 2 : 0,
    };
  },
  configure: async ({ cfg, prompter }) => {
    const resolved = resolveMSTeamsCredentials(cfg.channels?.msteams);
    const hasConfigCreds = Boolean(
      cfg.channels?.msteams?.appId?.trim() &&
      cfg.channels?.msteams?.appPassword?.trim() &&
      cfg.channels?.msteams?.tenantId?.trim(),
    );
    const canUseEnv = Boolean(
      !hasConfigCreds &&
      process.env.MSTEAMS_APP_ID?.trim() &&
      process.env.MSTEAMS_APP_PASSWORD?.trim() &&
      process.env.MSTEAMS_TENANT_ID?.trim(),
    );

    let next = cfg;
    let appId: string | null = null;
    let appPassword: string | null = null;
    let tenantId: string | null = null;

    if (!resolved) {
      await noteMSTeamsCredentialHelp(prompter);
    }

    if (canUseEnv) {
      const keepEnv = await prompter.confirm({
        message:
          "检测到 MSTEAMS_APP_ID + MSTEAMS_APP_PASSWORD + MSTEAMS_TENANT_ID，是否使用环境变量？",
        initialValue: true,
      });
      if (keepEnv) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            msteams: { ...next.channels?.msteams, enabled: true },
          },
        };
      } else {
        appId = String(
          await prompter.text({
            message: "输入 MS Teams App ID",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
        appPassword = String(
          await prompter.text({
            message: "输入 MS Teams App Password",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
        tenantId = String(
          await prompter.text({
            message: "输入 MS Teams Tenant ID",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    } else if (hasConfigCreds) {
      const keep = await prompter.confirm({
        message: "MS Teams 凭据已配置，是否保留？",
        initialValue: true,
      });
      if (!keep) {
        appId = String(
          await prompter.text({
            message: "输入 MS Teams App ID",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
        appPassword = String(
          await prompter.text({
            message: "输入 MS Teams App Password",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
        tenantId = String(
          await prompter.text({
            message: "输入 MS Teams Tenant ID",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    } else {
      appId = String(
        await prompter.text({
          message: "Enter MS Teams App ID",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
      appPassword = String(
        await prompter.text({
          message: "Enter MS Teams App Password",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
      tenantId = String(
        await prompter.text({
          message: "Enter MS Teams Tenant ID",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
    }

    if (appId && appPassword && tenantId) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          msteams: {
            ...next.channels?.msteams,
            enabled: true,
            appId,
            appPassword,
            tenantId,
          },
        },
      };
    }

    const currentEntries = Object.entries(next.channels?.msteams?.teams ?? {}).flatMap(
      ([teamKey, value]) => {
        const channels = value?.channels ?? {};
        const channelKeys = Object.keys(channels);
        if (channelKeys.length === 0) {
          return [teamKey];
        }
        return channelKeys.map((channelKey) => `${teamKey}/${channelKey}`);
      },
    );
    const accessConfig = await promptChannelAccessConfig({
      prompter,
      label: "MS Teams channels",
      currentPolicy: next.channels?.msteams?.groupPolicy ?? "allowlist",
      currentEntries,
      placeholder: "Team Name/Channel Name, teamId/conversationId",
      updatePrompt: Boolean(next.channels?.msteams?.teams),
    });
    if (accessConfig) {
      if (accessConfig.policy !== "allowlist") {
        next = setMSTeamsGroupPolicy(next, accessConfig.policy);
      } else {
        let entries = accessConfig.entries
          .map((entry) => parseMSTeamsTeamEntry(entry))
          .filter(Boolean) as Array<{ teamKey: string; channelKey?: string }>;
        if (accessConfig.entries.length > 0 && resolveMSTeamsCredentials(next.channels?.msteams)) {
          try {
            const resolved = await resolveMSTeamsChannelAllowlist({
              cfg: next,
              entries: accessConfig.entries,
            });
            const resolvedChannels = resolved.filter(
              (entry) => entry.resolved && entry.teamId && entry.channelId,
            );
            const resolvedTeams = resolved.filter(
              (entry) => entry.resolved && entry.teamId && !entry.channelId,
            );
            const unresolved = resolved
              .filter((entry) => !entry.resolved)
              .map((entry) => entry.input);

            entries = [
              ...resolvedChannels.map((entry) => ({
                teamKey: entry.teamId as string,
                channelKey: entry.channelId as string,
              })),
              ...resolvedTeams.map((entry) => ({
                teamKey: entry.teamId as string,
              })),
              ...unresolved.map((entry) => parseMSTeamsTeamEntry(entry)).filter(Boolean),
            ] as Array<{ teamKey: string; channelKey?: string }>;

            if (resolvedChannels.length > 0 || resolvedTeams.length > 0 || unresolved.length > 0) {
              const summary: string[] = [];
              if (resolvedChannels.length > 0) {
                summary.push(
                  `已解析频道：${resolvedChannels
                    .map((entry) => entry.channelId)
                    .filter(Boolean)
                    .join(", ")}`,
                );
              }
              if (resolvedTeams.length > 0) {
                summary.push(
                  `已解析团队：${resolvedTeams
                    .map((entry) => entry.teamId)
                    .filter(Boolean)
                    .join(", ")}`,
                );
              }
              if (unresolved.length > 0) {
                summary.push(`未解析（保留原始输入）：${unresolved.join(", ")}`);
              }
              await prompter.note(summary.join("\n"), "MS Teams 频道");
            }
          } catch (err) {
            await prompter.note(
              `频道查询失败，保留原始输入。${String(err)}`,
              "MS Teams 频道",
            );
          }
        }
        next = setMSTeamsGroupPolicy(next, "allowlist");
        next = setMSTeamsTeamsAllowlist(next, entries);
      }
    }

    return { cfg: next, accountId: DEFAULT_ACCOUNT_ID };
  },
  dmPolicy,
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      msteams: { ...cfg.channels?.msteams, enabled: false },
    },
  }),
};
