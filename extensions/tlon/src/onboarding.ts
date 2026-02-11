import type { OpenClawConfig } from "openclaw/plugin-sdk";
import {
  formatDocsLink,
  promptAccountId,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  type ChannelOnboardingAdapter,
  type WizardPrompter,
} from "openclaw/plugin-sdk";
import type { TlonResolvedAccount } from "./types.js";
import { listTlonAccountIds, resolveTlonAccount } from "./types.js";

const channel = "tlon" as const;

function isConfigured(account: TlonResolvedAccount): boolean {
  return Boolean(account.ship && account.url && account.code);
}

function applyAccountConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  input: {
    name?: string;
    ship?: string;
    url?: string;
    code?: string;
    groupChannels?: string[];
    dmAllowlist?: string[];
    autoDiscoverChannels?: boolean;
  };
}): OpenClawConfig {
  const { cfg, accountId, input } = params;
  const useDefault = accountId === DEFAULT_ACCOUNT_ID;
  const base = cfg.channels?.tlon ?? {};

  if (useDefault) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        tlon: {
          ...base,
          enabled: true,
          ...(input.name ? { name: input.name } : {}),
          ...(input.ship ? { ship: input.ship } : {}),
          ...(input.url ? { url: input.url } : {}),
          ...(input.code ? { code: input.code } : {}),
          ...(input.groupChannels ? { groupChannels: input.groupChannels } : {}),
          ...(input.dmAllowlist ? { dmAllowlist: input.dmAllowlist } : {}),
          ...(typeof input.autoDiscoverChannels === "boolean"
            ? { autoDiscoverChannels: input.autoDiscoverChannels }
            : {}),
        },
      },
    };
  }

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      tlon: {
        ...base,
        enabled: base.enabled ?? true,
        accounts: {
          ...(base as { accounts?: Record<string, unknown> }).accounts,
          [accountId]: {
            ...(base as { accounts?: Record<string, Record<string, unknown>> }).accounts?.[
              accountId
            ],
            enabled: true,
            ...(input.name ? { name: input.name } : {}),
            ...(input.ship ? { ship: input.ship } : {}),
            ...(input.url ? { url: input.url } : {}),
            ...(input.code ? { code: input.code } : {}),
            ...(input.groupChannels ? { groupChannels: input.groupChannels } : {}),
            ...(input.dmAllowlist ? { dmAllowlist: input.dmAllowlist } : {}),
            ...(typeof input.autoDiscoverChannels === "boolean"
              ? { autoDiscoverChannels: input.autoDiscoverChannels }
              : {}),
          },
        },
      },
    },
  };
}

async function noteTlonHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "你需要 Urbit 飞船 URL 和登录代码。",
      "URL 示例：https://your-ship-host",
      "飞船示例：~sampel-palnet",
      `Docs: ${formatDocsLink("/channels/tlon", "channels/tlon")}`,
    ].join("\n"),
    "Tlon 设置",
  );
}

function parseList(value: string): string[] {
  return value
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const tlonOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const accountIds = listTlonAccountIds(cfg);
    const configured =
      accountIds.length > 0
        ? accountIds.some((accountId) => isConfigured(resolveTlonAccount(cfg, accountId)))
        : isConfigured(resolveTlonAccount(cfg, DEFAULT_ACCOUNT_ID));

    return {
      channel,
      configured,
      statusLines: [`Tlon：${configured ? "已配置" : "需要设置"}`],
      selectionHint: configured ? "已配置" : "Urbit 即时通讯",
      quickstartScore: configured ? 1 : 4,
    };
  },
  configure: async ({ cfg, prompter, accountOverrides, shouldPromptAccountIds }) => {
    const override = accountOverrides[channel]?.trim();
    const defaultAccountId = DEFAULT_ACCOUNT_ID;
    let accountId = override ? normalizeAccountId(override) : defaultAccountId;

    if (shouldPromptAccountIds && !override) {
      accountId = await promptAccountId({
        cfg,
        prompter,
        label: "Tlon",
        currentId: accountId,
        listAccountIds: listTlonAccountIds,
        defaultAccountId,
      });
    }

    const resolved = resolveTlonAccount(cfg, accountId);
    await noteTlonHelp(prompter);

    const ship = await prompter.text({
      message: "飞船名称",
      placeholder: "~sampel-palnet",
      initialValue: resolved.ship ?? undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });

    const url = await prompter.text({
      message: "飞船 URL",
      placeholder: "https://your-ship-host",
      initialValue: resolved.url ?? undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });

    const code = await prompter.text({
      message: "登录代码",
      placeholder: "lidlut-tabwed-pillex-ridrup",
      initialValue: resolved.code ?? undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });

    const wantsGroupChannels = await prompter.confirm({
      message: "手动添加群组频道？（可选）",
      initialValue: false,
    });

    let groupChannels: string[] | undefined;
    if (wantsGroupChannels) {
      const entry = await prompter.text({
        message: "群组频道（逗号分隔）",
        placeholder: "chat/~host-ship/general, chat/~host-ship/support",
      });
      const parsed = parseList(String(entry ?? ""));
      groupChannels = parsed.length > 0 ? parsed : undefined;
    }

    const wantsAllowlist = await prompter.confirm({
      message: "是否使用白名单限制私信？",
      initialValue: false,
    });

    let dmAllowlist: string[] | undefined;
    if (wantsAllowlist) {
      const entry = await prompter.text({
        message: "私信白名单（逗号分隔的飞船名称）",
        placeholder: "~zod, ~nec",
      });
      const parsed = parseList(String(entry ?? ""));
      dmAllowlist = parsed.length > 0 ? parsed : undefined;
    }

    const autoDiscoverChannels = await prompter.confirm({
      message: "是否启用群组频道自动发现？",
      initialValue: resolved.autoDiscoverChannels ?? true,
    });

    const next = applyAccountConfig({
      cfg,
      accountId,
      input: {
        ship: String(ship).trim(),
        url: String(url).trim(),
        code: String(code).trim(),
        groupChannels,
        dmAllowlist,
        autoDiscoverChannels,
      },
    });

    return { cfg: next, accountId };
  },
};
