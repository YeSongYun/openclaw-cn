import type { OpenClawConfig } from "../../../config/config.js";
import type { DmPolicy } from "../../../config/types.js";
import type { WizardPrompter } from "../../../wizard/prompts.js";
import type { ChannelOnboardingAdapter, ChannelOnboardingDmPolicy } from "../onboarding-types.js";
import { detectBinary } from "../../../commands/onboard-helpers.js";
import {
  listIMessageAccountIds,
  resolveDefaultIMessageAccountId,
  resolveIMessageAccount,
} from "../../../imessage/accounts.js";
import { normalizeIMessageHandle } from "../../../imessage/targets.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../routing/session-key.js";
import { formatDocsLink } from "../../../terminal/links.js";
import { addWildcardAllowFrom, promptAccountId } from "./helpers.js";

const channel = "imessage" as const;

function setIMessageDmPolicy(cfg: OpenClawConfig, dmPolicy: DmPolicy) {
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(cfg.channels?.imessage?.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      imessage: {
        ...cfg.channels?.imessage,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  };
}

function setIMessageAllowFrom(
  cfg: OpenClawConfig,
  accountId: string,
  allowFrom: string[],
): OpenClawConfig {
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        imessage: {
          ...cfg.channels?.imessage,
          allowFrom,
        },
      },
    };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      imessage: {
        ...cfg.channels?.imessage,
        accounts: {
          ...cfg.channels?.imessage?.accounts,
          [accountId]: {
            ...cfg.channels?.imessage?.accounts?.[accountId],
            allowFrom,
          },
        },
      },
    },
  };
}

function parseIMessageAllowFromInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function promptIMessageAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  const accountId =
    params.accountId && normalizeAccountId(params.accountId)
      ? (normalizeAccountId(params.accountId) ?? DEFAULT_ACCOUNT_ID)
      : resolveDefaultIMessageAccountId(params.cfg);
  const resolved = resolveIMessageAccount({ cfg: params.cfg, accountId });
  const existing = resolved.config.allowFrom ?? [];
  await params.prompter.note(
    [
      "通过句柄或聊天目标将 iMessage 私信加入白名单。",
      "示例：",
      "- +15555550123",
      "- user@example.com",
      "- chat_id:123",
      "- chat_guid:... 或 chat_identifier:...",
      "多个条目：逗号分隔。",
      `文档：${formatDocsLink("/imessage", "imessage")}`,
    ].join("\n"),
    "iMessage 白名单",
  );
  const entry = await params.prompter.text({
    message: "iMessage 白名单（句柄或 chat_id）",
    placeholder: "+15555550123, user@example.com, chat_id:123",
    initialValue: existing[0] ? String(existing[0]) : undefined,
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) {
        return "必填";
      }
      const parts = parseIMessageAllowFromInput(raw);
      for (const part of parts) {
        if (part === "*") {
          continue;
        }
        if (part.toLowerCase().startsWith("chat_id:")) {
          const id = part.slice("chat_id:".length).trim();
          if (!/^\d+$/.test(id)) {
            return `无效的 chat_id：${part}`;
          }
          continue;
        }
        if (part.toLowerCase().startsWith("chat_guid:")) {
          if (!part.slice("chat_guid:".length).trim()) {
            return "无效的 chat_guid 条目";
          }
          continue;
        }
        if (part.toLowerCase().startsWith("chat_identifier:")) {
          if (!part.slice("chat_identifier:".length).trim()) {
            return "无效的 chat_identifier 条目";
          }
          continue;
        }
        if (!normalizeIMessageHandle(part)) {
          return `无效的句柄：${part}`;
        }
      }
      return undefined;
    },
  });
  const parts = parseIMessageAllowFromInput(String(entry));
  const unique = [...new Set(parts)];
  return setIMessageAllowFrom(params.cfg, accountId, unique);
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "iMessage",
  channel,
  policyKey: "channels.imessage.dmPolicy",
  allowFromKey: "channels.imessage.allowFrom",
  getCurrent: (cfg) => cfg.channels?.imessage?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setIMessageDmPolicy(cfg, policy),
  promptAllowFrom: promptIMessageAllowFrom,
};

export const imessageOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listIMessageAccountIds(cfg).some((accountId) => {
      const account = resolveIMessageAccount({ cfg, accountId });
      return Boolean(
        account.config.cliPath ||
        account.config.dbPath ||
        account.config.allowFrom ||
        account.config.service ||
        account.config.region,
      );
    });
    const imessageCliPath = cfg.channels?.imessage?.cliPath ?? "imsg";
    const imessageCliDetected = await detectBinary(imessageCliPath);
    return {
      channel,
      configured,
      statusLines: [
        `iMessage：${configured ? "已配置" : "需要设置"}`,
        `imsg：${imessageCliDetected ? "已找到" : "缺失"} (${imessageCliPath})`,
      ],
      selectionHint: imessageCliDetected ? "imsg 已找到" : "imsg 缺失",
      quickstartScore: imessageCliDetected ? 1 : 0,
    };
  },
  configure: async ({ cfg, prompter, accountOverrides, shouldPromptAccountIds }) => {
    const imessageOverride = accountOverrides.imessage?.trim();
    const defaultIMessageAccountId = resolveDefaultIMessageAccountId(cfg);
    let imessageAccountId = imessageOverride
      ? normalizeAccountId(imessageOverride)
      : defaultIMessageAccountId;
    if (shouldPromptAccountIds && !imessageOverride) {
      imessageAccountId = await promptAccountId({
        cfg,
        prompter,
        label: "iMessage",
        currentId: imessageAccountId,
        listAccountIds: listIMessageAccountIds,
        defaultAccountId: defaultIMessageAccountId,
      });
    }

    let next = cfg;
    const resolvedAccount = resolveIMessageAccount({
      cfg: next,
      accountId: imessageAccountId,
    });
    let resolvedCliPath = resolvedAccount.config.cliPath ?? "imsg";
    const cliDetected = await detectBinary(resolvedCliPath);
    if (!cliDetected) {
      const entered = await prompter.text({
        message: "imsg CLI 路径",
        initialValue: resolvedCliPath,
        validate: (value) => (value?.trim() ? undefined : "必填"),
      });
      resolvedCliPath = String(entered).trim();
      if (!resolvedCliPath) {
        await prompter.note("需要 imsg CLI 路径才能启用 iMessage。", "iMessage");
      }
    }

    if (resolvedCliPath) {
      if (imessageAccountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            imessage: {
              ...next.channels?.imessage,
              enabled: true,
              cliPath: resolvedCliPath,
            },
          },
        };
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            imessage: {
              ...next.channels?.imessage,
              enabled: true,
              accounts: {
                ...next.channels?.imessage?.accounts,
                [imessageAccountId]: {
                  ...next.channels?.imessage?.accounts?.[imessageAccountId],
                  enabled: next.channels?.imessage?.accounts?.[imessageAccountId]?.enabled ?? true,
                  cliPath: resolvedCliPath,
                },
              },
            },
          },
        };
      }
    }

    await prompter.note(
      [
        "此功能仍在开发中。",
        "确保 OpenClaw 拥有对消息数据库的完全磁盘访问权限。",
        "在提示时授予消息的自动化权限。",
        "使用以下命令列出聊天：imsg chats --limit 20",
        `文档：${formatDocsLink("/imessage", "imessage")}`,
      ].join("\n"),
      "iMessage 后续步骤",
    );

    return { cfg: next, accountId: imessageAccountId };
  },
  dmPolicy,
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      imessage: { ...cfg.channels?.imessage, enabled: false },
    },
  }),
};
