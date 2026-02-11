import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  OpenClawConfig,
  DmPolicy,
  WizardPrompter,
} from "openclaw/plugin-sdk";
import {
  DEFAULT_ACCOUNT_ID,
  addWildcardAllowFrom,
  formatDocsLink,
  normalizeAccountId,
  promptAccountId,
} from "openclaw/plugin-sdk";
import {
  listBlueBubblesAccountIds,
  resolveBlueBubblesAccount,
  resolveDefaultBlueBubblesAccountId,
} from "./accounts.js";
import { parseBlueBubblesAllowTarget } from "./targets.js";
import { normalizeBlueBubblesServerUrl } from "./types.js";

const channel = "bluebubbles" as const;

function setBlueBubblesDmPolicy(cfg: OpenClawConfig, dmPolicy: DmPolicy): OpenClawConfig {
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(cfg.channels?.bluebubbles?.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      bluebubbles: {
        ...cfg.channels?.bluebubbles,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  };
}

function setBlueBubblesAllowFrom(
  cfg: OpenClawConfig,
  accountId: string,
  allowFrom: string[],
): OpenClawConfig {
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        bluebubbles: {
          ...cfg.channels?.bluebubbles,
          allowFrom,
        },
      },
    };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      bluebubbles: {
        ...cfg.channels?.bluebubbles,
        accounts: {
          ...cfg.channels?.bluebubbles?.accounts,
          [accountId]: {
            ...cfg.channels?.bluebubbles?.accounts?.[accountId],
            allowFrom,
          },
        },
      },
    },
  };
}

function parseBlueBubblesAllowFromInput(raw: string): string[] {
  return raw
    .split(/[\n,]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function promptBlueBubblesAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  const accountId =
    params.accountId && normalizeAccountId(params.accountId)
      ? (normalizeAccountId(params.accountId) ?? DEFAULT_ACCOUNT_ID)
      : resolveDefaultBlueBubblesAccountId(params.cfg);
  const resolved = resolveBlueBubblesAccount({ cfg: params.cfg, accountId });
  const existing = resolved.config.allowFrom ?? [];
  await params.prompter.note(
    [
      "通过句柄或聊天目标设置 BlueBubbles 私信白名单。",
      "示例：",
      "- +15555550123",
      "- user@example.com",
      "- chat_id:123",
      "- chat_guid:iMessage;-;+15555550123",
      "多个条目：用逗号或换行分隔。",
      `Docs: ${formatDocsLink("/channels/bluebubbles", "bluebubbles")}`,
    ].join("\n"),
    "BlueBubbles 白名单",
  );
  const entry = await params.prompter.text({
    message: "BlueBubbles 白名单（句柄或 chat_id）",
    placeholder: "+15555550123, user@example.com, chat_id:123",
    initialValue: existing[0] ? String(existing[0]) : undefined,
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) {
        return "必填";
      }
      const parts = parseBlueBubblesAllowFromInput(raw);
      for (const part of parts) {
        if (part === "*") {
          continue;
        }
        const parsed = parseBlueBubblesAllowTarget(part);
        if (parsed.kind === "handle" && !parsed.handle) {
          return `无效条目：${part}`;
        }
      }
      return undefined;
    },
  });
  const parts = parseBlueBubblesAllowFromInput(String(entry));
  const unique = [...new Set(parts)];
  return setBlueBubblesAllowFrom(params.cfg, accountId, unique);
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "BlueBubbles",
  channel,
  policyKey: "channels.bluebubbles.dmPolicy",
  allowFromKey: "channels.bluebubbles.allowFrom",
  getCurrent: (cfg) => cfg.channels?.bluebubbles?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setBlueBubblesDmPolicy(cfg, policy),
  promptAllowFrom: promptBlueBubblesAllowFrom,
};

export const blueBubblesOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listBlueBubblesAccountIds(cfg).some((accountId) => {
      const account = resolveBlueBubblesAccount({ cfg, accountId });
      return account.configured;
    });
    return {
      channel,
      configured,
      statusLines: [`BlueBubbles：${configured ? "已配置" : "需要设置"}`],
      selectionHint: configured ? "已配置" : "通过 BlueBubbles 应用使用 iMessage",
      quickstartScore: configured ? 1 : 0,
    };
  },
  configure: async ({ cfg, prompter, accountOverrides, shouldPromptAccountIds }) => {
    const blueBubblesOverride = accountOverrides.bluebubbles?.trim();
    const defaultAccountId = resolveDefaultBlueBubblesAccountId(cfg);
    let accountId = blueBubblesOverride
      ? normalizeAccountId(blueBubblesOverride)
      : defaultAccountId;
    if (shouldPromptAccountIds && !blueBubblesOverride) {
      accountId = await promptAccountId({
        cfg,
        prompter,
        label: "BlueBubbles",
        currentId: accountId,
        listAccountIds: listBlueBubblesAccountIds,
        defaultAccountId,
      });
    }

    let next = cfg;
    const resolvedAccount = resolveBlueBubblesAccount({ cfg: next, accountId });

    // Prompt for server URL
    let serverUrl = resolvedAccount.config.serverUrl?.trim();
    if (!serverUrl) {
      await prompter.note(
        [
          "输入 BlueBubbles 服务器 URL（例如 http://192.168.1.100:1234）。",
          "在 BlueBubbles Server 应用的「连接」中找到此信息。",
          `Docs: ${formatDocsLink("/channels/bluebubbles", "bluebubbles")}`,
        ].join("\n"),
        "BlueBubbles 服务器 URL",
      );
      const entered = await prompter.text({
        message: "BlueBubbles 服务器 URL",
        placeholder: "http://192.168.1.100:1234",
        validate: (value) => {
          const trimmed = String(value ?? "").trim();
          if (!trimmed) {
            return "必填";
          }
          try {
            const normalized = normalizeBlueBubblesServerUrl(trimmed);
            new URL(normalized);
            return undefined;
          } catch {
            return "无效的 URL 格式";
          }
        },
      });
      serverUrl = String(entered).trim();
    } else {
      const keepUrl = await prompter.confirm({
        message: `BlueBubbles 服务器 URL 已设置（${serverUrl}）。是否保留？`,
        initialValue: true,
      });
      if (!keepUrl) {
        const entered = await prompter.text({
          message: "BlueBubbles 服务器 URL",
          placeholder: "http://192.168.1.100:1234",
          initialValue: serverUrl,
          validate: (value) => {
            const trimmed = String(value ?? "").trim();
            if (!trimmed) {
              return "必填";
            }
            try {
              const normalized = normalizeBlueBubblesServerUrl(trimmed);
              new URL(normalized);
              return undefined;
            } catch {
              return "无效的 URL 格式";
            }
          },
        });
        serverUrl = String(entered).trim();
      }
    }

    // Prompt for password
    let password = resolvedAccount.config.password?.trim();
    if (!password) {
      await prompter.note(
        [
          "输入 BlueBubbles 服务器密码。",
          "在 BlueBubbles Server 应用的「设置」中找到此信息。",
        ].join("\n"),
        "BlueBubbles 密码",
      );
      const entered = await prompter.text({
        message: "BlueBubbles 密码",
        validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
      });
      password = String(entered).trim();
    } else {
      const keepPassword = await prompter.confirm({
        message: "BlueBubbles 密码已设置。是否保留？",
        initialValue: true,
      });
      if (!keepPassword) {
        const entered = await prompter.text({
          message: "BlueBubbles 密码",
          validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
        });
        password = String(entered).trim();
      }
    }

    // Prompt for webhook path (optional)
    const existingWebhookPath = resolvedAccount.config.webhookPath?.trim();
    const wantsWebhook = await prompter.confirm({
      message: "是否配置自定义 Webhook 路径？（默认：/bluebubbles-webhook）",
      initialValue: Boolean(existingWebhookPath && existingWebhookPath !== "/bluebubbles-webhook"),
    });
    let webhookPath = "/bluebubbles-webhook";
    if (wantsWebhook) {
      const entered = await prompter.text({
        message: "Webhook 路径",
        placeholder: "/bluebubbles-webhook",
        initialValue: existingWebhookPath || "/bluebubbles-webhook",
        validate: (value) => {
          const trimmed = String(value ?? "").trim();
          if (!trimmed) {
            return "必填";
          }
          if (!trimmed.startsWith("/")) {
            return "路径必须以 / 开头";
          }
          return undefined;
        },
      });
      webhookPath = String(entered).trim();
    }

    // Apply config
    if (accountId === DEFAULT_ACCOUNT_ID) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          bluebubbles: {
            ...next.channels?.bluebubbles,
            enabled: true,
            serverUrl,
            password,
            webhookPath,
          },
        },
      };
    } else {
      next = {
        ...next,
        channels: {
          ...next.channels,
          bluebubbles: {
            ...next.channels?.bluebubbles,
            enabled: true,
            accounts: {
              ...next.channels?.bluebubbles?.accounts,
              [accountId]: {
                ...next.channels?.bluebubbles?.accounts?.[accountId],
                enabled: next.channels?.bluebubbles?.accounts?.[accountId]?.enabled ?? true,
                serverUrl,
                password,
                webhookPath,
              },
            },
          },
        },
      };
    }

    await prompter.note(
      [
        "在 BlueBubbles Server 中配置 Webhook URL：",
        "1. 打开 BlueBubbles Server → 设置 → Webhooks",
        "2. 添加你的 OpenClaw 网关 URL + Webhook 路径",
        "   示例：https://your-gateway-host:3000/bluebubbles-webhook",
        "3. 启用 Webhook 并保存",
        "",
        `Docs: ${formatDocsLink("/channels/bluebubbles", "bluebubbles")}`,
      ].join("\n"),
      "BlueBubbles 后续步骤",
    );

    return { cfg: next, accountId };
  },
  dmPolicy,
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      bluebubbles: { ...cfg.channels?.bluebubbles, enabled: false },
    },
  }),
};
