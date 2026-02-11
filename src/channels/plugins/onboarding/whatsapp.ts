import path from "node:path";
import type { OpenClawConfig } from "../../../config/config.js";
import type { DmPolicy } from "../../../config/types.js";
import type { RuntimeEnv } from "../../../runtime.js";
import type { WizardPrompter } from "../../../wizard/prompts.js";
import type { ChannelOnboardingAdapter } from "../onboarding-types.js";
import { loginWeb } from "../../../channel-web.js";
import { formatCliCommand } from "../../../cli/command-format.js";
import { mergeWhatsAppConfig } from "../../../config/merge-config.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../routing/session-key.js";
import { formatDocsLink } from "../../../terminal/links.js";
import { normalizeE164, pathExists } from "../../../utils.js";
import {
  listWhatsAppAccountIds,
  resolveDefaultWhatsAppAccountId,
  resolveWhatsAppAuthDir,
} from "../../../web/accounts.js";
import { promptAccountId } from "./helpers.js";

const channel = "whatsapp" as const;

function setWhatsAppDmPolicy(cfg: OpenClawConfig, dmPolicy: DmPolicy): OpenClawConfig {
  return mergeWhatsAppConfig(cfg, { dmPolicy });
}

function setWhatsAppAllowFrom(cfg: OpenClawConfig, allowFrom?: string[]): OpenClawConfig {
  return mergeWhatsAppConfig(cfg, { allowFrom }, { unsetOnUndefined: ["allowFrom"] });
}

function setWhatsAppSelfChatMode(cfg: OpenClawConfig, selfChatMode: boolean): OpenClawConfig {
  return mergeWhatsAppConfig(cfg, { selfChatMode });
}

async function detectWhatsAppLinked(cfg: OpenClawConfig, accountId: string): Promise<boolean> {
  const { authDir } = resolveWhatsAppAuthDir({ cfg, accountId });
  const credsPath = path.join(authDir, "creds.json");
  return await pathExists(credsPath);
}

async function promptWhatsAppAllowFrom(
  cfg: OpenClawConfig,
  _runtime: RuntimeEnv,
  prompter: WizardPrompter,
  options?: { forceAllowlist?: boolean },
): Promise<OpenClawConfig> {
  const existingPolicy = cfg.channels?.whatsapp?.dmPolicy ?? "pairing";
  const existingAllowFrom = cfg.channels?.whatsapp?.allowFrom ?? [];
  const existingLabel = existingAllowFrom.length > 0 ? existingAllowFrom.join(", ") : "unset";

  if (options?.forceAllowlist) {
    await prompter.note(
      "我们需要发送者/所有者号码，以便 OpenClaw 将你加入白名单。",
      "WhatsApp 号码",
    );
    const entry = await prompter.text({
      message: "你的个人 WhatsApp 号码（你将用来发送消息的手机）",
      placeholder: "+15555550123",
      initialValue: existingAllowFrom[0],
      validate: (value) => {
        const raw = String(value ?? "").trim();
        if (!raw) {
          return "必填";
        }
        const normalized = normalizeE164(raw);
        if (!normalized) {
          return `无效号码：${raw}`;
        }
        return undefined;
      },
    });
    const normalized = normalizeE164(String(entry).trim());
    const merged = [
      ...existingAllowFrom
        .filter((item) => item !== "*")
        .map((item) => normalizeE164(item))
        .filter(Boolean),
      normalized,
    ];
    const unique = [...new Set(merged.filter(Boolean))];
    let next = setWhatsAppSelfChatMode(cfg, true);
    next = setWhatsAppDmPolicy(next, "allowlist");
    next = setWhatsAppAllowFrom(next, unique);
    await prompter.note(
      ["白名单模式已启用。", `- allowFrom 包含 ${normalized}`].join("\n"),
      "WhatsApp 白名单",
    );
    return next;
  }

  await prompter.note(
    [
      "WhatsApp 私信由 `channels.whatsapp.dmPolicy` + `channels.whatsapp.allowFrom` 控制。",
      "- pairing（默认）：未知发送者会收到配对码；所有者审批",
      "- allowlist：未知发送者被阻止",
      '- open：公开接收私信（需要 allowFrom 包含 "*"）',
      "- disabled：忽略 WhatsApp 私信",
      "",
      `当前：dmPolicy=${existingPolicy}，allowFrom=${existingLabel}`,
      `文档：${formatDocsLink("/whatsapp", "whatsapp")}`,
    ].join("\n"),
    "WhatsApp 私信访问",
  );

  const phoneMode = await prompter.select({
    message: "WhatsApp 手机设置",
    options: [
      { value: "personal", label: "这是我的个人手机号码" },
      { value: "separate", label: "专门用于 OpenClaw 的独立手机" },
    ],
  });

  if (phoneMode === "personal") {
    await prompter.note(
      "我们需要发送者/所有者号码，以便 OpenClaw 将你加入白名单。",
      "WhatsApp 号码",
    );
    const entry = await prompter.text({
      message: "你的个人 WhatsApp 号码（你将用来发送消息的手机）",
      placeholder: "+15555550123",
      initialValue: existingAllowFrom[0],
      validate: (value) => {
        const raw = String(value ?? "").trim();
        if (!raw) {
          return "必填";
        }
        const normalized = normalizeE164(raw);
        if (!normalized) {
          return `无效号码：${raw}`;
        }
        return undefined;
      },
    });
    const normalized = normalizeE164(String(entry).trim());
    const merged = [
      ...existingAllowFrom
        .filter((item) => item !== "*")
        .map((item) => normalizeE164(item))
        .filter(Boolean),
      normalized,
    ];
    const unique = [...new Set(merged.filter(Boolean))];
    let next = setWhatsAppSelfChatMode(cfg, true);
    next = setWhatsAppDmPolicy(next, "allowlist");
    next = setWhatsAppAllowFrom(next, unique);
    await prompter.note(
      [
        "个人手机模式已启用。",
        "- dmPolicy 设置为 allowlist（跳过配对）",
        `- allowFrom 包含 ${normalized}`,
      ].join("\n"),
      "WhatsApp 个人手机",
    );
    return next;
  }

  const policy = (await prompter.select({
    message: "WhatsApp 私信策略",
    options: [
      { value: "pairing", label: "配对（推荐）" },
      { value: "allowlist", label: "仅白名单（阻止未知发送者）" },
      { value: "open", label: "开放（公开接收私信）" },
      { value: "disabled", label: "已禁用（忽略 WhatsApp 私信）" },
    ],
  })) as DmPolicy;

  let next = setWhatsAppSelfChatMode(cfg, false);
  next = setWhatsAppDmPolicy(next, policy);
  if (policy === "open") {
    next = setWhatsAppAllowFrom(next, ["*"]);
  }
  if (policy === "disabled") {
    return next;
  }

  const allowOptions =
    existingAllowFrom.length > 0
      ? ([
          { value: "keep", label: "保留当前 allowFrom" },
          {
            value: "unset",
            label: "取消设置 allowFrom（仅使用配对审批）",
          },
          { value: "list", label: "将 allowFrom 设置为特定号码" },
        ] as const)
      : ([
          { value: "unset", label: "取消设置 allowFrom（默认）" },
          { value: "list", label: "将 allowFrom 设置为特定号码" },
        ] as const);

  const mode = await prompter.select({
    message: "WhatsApp allowFrom（可选预白名单）",
    options: allowOptions.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
  });

  if (mode === "keep") {
    // Keep allowFrom as-is.
  } else if (mode === "unset") {
    next = setWhatsAppAllowFrom(next, undefined);
  } else {
    const allowRaw = await prompter.text({
      message: "允许的发送者号码（逗号分隔，E.164 格式）",
      placeholder: "+15555550123, +447700900123",
      validate: (value) => {
        const raw = String(value ?? "").trim();
        if (!raw) {
          return "必填";
        }
        const parts = raw
          .split(/[\n,;]+/g)
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length === 0) {
          return "必填";
        }
        for (const part of parts) {
          if (part === "*") {
            continue;
          }
          const normalized = normalizeE164(part);
          if (!normalized) {
            return `无效号码：${part}`;
          }
        }
        return undefined;
      },
    });

    const parts = String(allowRaw)
      .split(/[\n,;]+/g)
      .map((p) => p.trim())
      .filter(Boolean);
    const normalized = parts.map((part) => (part === "*" ? "*" : normalizeE164(part)));
    const unique = [...new Set(normalized.filter(Boolean))];
    next = setWhatsAppAllowFrom(next, unique);
  }

  return next;
}

export const whatsappOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg, accountOverrides }) => {
    const overrideId = accountOverrides.whatsapp?.trim();
    const defaultAccountId = resolveDefaultWhatsAppAccountId(cfg);
    const accountId = overrideId ? normalizeAccountId(overrideId) : defaultAccountId;
    const linked = await detectWhatsAppLinked(cfg, accountId);
    const accountLabel = accountId === DEFAULT_ACCOUNT_ID ? "default" : accountId;
    return {
      channel,
      configured: linked,
      statusLines: [`WhatsApp (${accountLabel})：${linked ? "已关联" : "未关联"}`],
      selectionHint: linked ? "已关联" : "未关联",
      quickstartScore: linked ? 5 : 4,
    };
  },
  configure: async ({
    cfg,
    runtime,
    prompter,
    options,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const overrideId = accountOverrides.whatsapp?.trim();
    let accountId = overrideId
      ? normalizeAccountId(overrideId)
      : resolveDefaultWhatsAppAccountId(cfg);
    if (shouldPromptAccountIds || options?.promptWhatsAppAccountId) {
      if (!overrideId) {
        accountId = await promptAccountId({
          cfg,
          prompter,
          label: "WhatsApp",
          currentId: accountId,
          listAccountIds: listWhatsAppAccountIds,
          defaultAccountId: resolveDefaultWhatsAppAccountId(cfg),
        });
      }
    }

    let next = cfg;
    if (accountId !== DEFAULT_ACCOUNT_ID) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          whatsapp: {
            ...next.channels?.whatsapp,
            accounts: {
              ...next.channels?.whatsapp?.accounts,
              [accountId]: {
                ...next.channels?.whatsapp?.accounts?.[accountId],
                enabled: next.channels?.whatsapp?.accounts?.[accountId]?.enabled ?? true,
              },
            },
          },
        },
      };
    }

    const linked = await detectWhatsAppLinked(next, accountId);
    const { authDir } = resolveWhatsAppAuthDir({
      cfg: next,
      accountId,
    });

    if (!linked) {
      await prompter.note(
        [
          "用手机上的 WhatsApp 扫描二维码。",
          `凭据存储在 ${authDir}/ 下，供后续运行使用。`,
          `文档：${formatDocsLink("/whatsapp", "whatsapp")}`,
        ].join("\n"),
        "WhatsApp 关联",
      );
    }
    const wantsLink = await prompter.confirm({
      message: linked ? "WhatsApp 已关联。重新关联吗？" : "现在关联 WhatsApp（二维码）？",
      initialValue: !linked,
    });
    if (wantsLink) {
      try {
        await loginWeb(false, undefined, runtime, accountId);
      } catch (err) {
        runtime.error(`WhatsApp login failed: ${String(err)}`);
        await prompter.note(`文档：${formatDocsLink("/whatsapp", "whatsapp")}`, "WhatsApp 帮助");
      }
    } else if (!linked) {
      await prompter.note(
        `稍后运行 \`${formatCliCommand("openclaw channels login")}\` 来关联 WhatsApp。`,
        "WhatsApp",
      );
    }

    next = await promptWhatsAppAllowFrom(next, runtime, prompter, {
      forceAllowlist: forceAllowFrom,
    });

    return { cfg: next, accountId };
  },
  onAccountRecorded: (accountId, options) => {
    options?.onWhatsAppAccountId?.(accountId);
  },
};
