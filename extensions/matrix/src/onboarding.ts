import type { DmPolicy } from "openclaw/plugin-sdk";
import {
  addWildcardAllowFrom,
  formatDocsLink,
  promptChannelAccessConfig,
  type ChannelOnboardingAdapter,
  type ChannelOnboardingDmPolicy,
  type WizardPrompter,
} from "openclaw/plugin-sdk";
import type { CoreConfig } from "./types.js";
import { listMatrixDirectoryGroupsLive } from "./directory-live.js";
import { resolveMatrixAccount } from "./matrix/accounts.js";
import { ensureMatrixSdkInstalled, isMatrixSdkAvailable } from "./matrix/deps.js";
import { resolveMatrixTargets } from "./resolve-targets.js";

const channel = "matrix" as const;

function setMatrixDmPolicy(cfg: CoreConfig, policy: DmPolicy) {
  const allowFrom =
    policy === "open" ? addWildcardAllowFrom(cfg.channels?.matrix?.dm?.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      matrix: {
        ...cfg.channels?.matrix,
        dm: {
          ...cfg.channels?.matrix?.dm,
          policy,
          ...(allowFrom ? { allowFrom } : {}),
        },
      },
    },
  };
}

async function noteMatrixAuthHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "Matrix 需要一个 homeserver URL。",
      "使用访问令牌（推荐）或密码（登录后存储令牌）。",
      "使用访问令牌时：用户 ID 会自动获取。",
      "支持的环境变量：MATRIX_HOMESERVER、MATRIX_USER_ID、MATRIX_ACCESS_TOKEN、MATRIX_PASSWORD。",
      `文档：${formatDocsLink("/channels/matrix", "channels/matrix")}`,
    ].join("\n"),
    "Matrix 设置",
  );
}

async function promptMatrixAllowFrom(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
}): Promise<CoreConfig> {
  const { cfg, prompter } = params;
  const existingAllowFrom = cfg.channels?.matrix?.dm?.allowFrom ?? [];
  const account = resolveMatrixAccount({ cfg });
  const canResolve = Boolean(account.configured);

  const parseInput = (raw: string) =>
    raw
      .split(/[\n,;]+/g)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const isFullUserId = (value: string) => value.startsWith("@") && value.includes(":");

  while (true) {
    const entry = await prompter.text({
      message: "Matrix 白名单（完整 @user:server 格式；显示名称仅在唯一时有效）",
      placeholder: "@user:server",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
    });
    const parts = parseInput(String(entry));
    const resolvedIds: string[] = [];
    const pending: string[] = [];
    const unresolved: string[] = [];
    const unresolvedNotes: string[] = [];

    for (const part of parts) {
      if (isFullUserId(part)) {
        resolvedIds.push(part);
        continue;
      }
      if (!canResolve) {
        unresolved.push(part);
        continue;
      }
      pending.push(part);
    }

    if (pending.length > 0) {
      const results = await resolveMatrixTargets({
        cfg,
        inputs: pending,
        kind: "user",
      }).catch(() => []);
      for (const result of results) {
        if (result?.resolved && result.id) {
          resolvedIds.push(result.id);
          continue;
        }
        if (result?.input) {
          unresolved.push(result.input);
          if (result.note) {
            unresolvedNotes.push(`${result.input}: ${result.note}`);
          }
        }
      }
    }

    if (unresolved.length > 0) {
      const details = unresolvedNotes.length > 0 ? unresolvedNotes : unresolved;
      await prompter.note(
        `无法解析：\n${details.join("\n")}\n请使用完整的 @user:server ID。`,
        "Matrix 白名单",
      );
      continue;
    }

    const unique = [
      ...new Set([
        ...existingAllowFrom.map((item) => String(item).trim()).filter(Boolean),
        ...resolvedIds,
      ]),
    ];
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        matrix: {
          ...cfg.channels?.matrix,
          enabled: true,
          dm: {
            ...cfg.channels?.matrix?.dm,
            policy: "allowlist",
            allowFrom: unique,
          },
        },
      },
    };
  }
}

function setMatrixGroupPolicy(cfg: CoreConfig, groupPolicy: "open" | "allowlist" | "disabled") {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      matrix: {
        ...cfg.channels?.matrix,
        enabled: true,
        groupPolicy,
      },
    },
  };
}

function setMatrixGroupRooms(cfg: CoreConfig, roomKeys: string[]) {
  const groups = Object.fromEntries(roomKeys.map((key) => [key, { allow: true }]));
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      matrix: {
        ...cfg.channels?.matrix,
        enabled: true,
        groups,
      },
    },
  };
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Matrix",
  channel,
  policyKey: "channels.matrix.dm.policy",
  allowFromKey: "channels.matrix.dm.allowFrom",
  getCurrent: (cfg) => (cfg as CoreConfig).channels?.matrix?.dm?.policy ?? "pairing",
  setPolicy: (cfg, policy) => setMatrixDmPolicy(cfg as CoreConfig, policy),
  promptAllowFrom: promptMatrixAllowFrom,
};

export const matrixOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const account = resolveMatrixAccount({ cfg: cfg as CoreConfig });
    const configured = account.configured;
    const sdkReady = isMatrixSdkAvailable();
    return {
      channel,
      configured,
      statusLines: [
        `Matrix：${configured ? "已配置" : "需要 homeserver + 访问令牌或密码"}`,
      ],
      selectionHint: !sdkReady
        ? "需要安装 @vector-im/matrix-bot-sdk"
        : configured
          ? "已配置"
          : "需要认证",
    };
  },
  configure: async ({ cfg, runtime, prompter, forceAllowFrom }) => {
    let next = cfg as CoreConfig;
    await ensureMatrixSdkInstalled({
      runtime,
      confirm: async (message) =>
        await prompter.confirm({
          message,
          initialValue: true,
        }),
    });
    const existing = next.channels?.matrix ?? {};
    const account = resolveMatrixAccount({ cfg: next });
    if (!account.configured) {
      await noteMatrixAuthHelp(prompter);
    }

    const envHomeserver = process.env.MATRIX_HOMESERVER?.trim();
    const envUserId = process.env.MATRIX_USER_ID?.trim();
    const envAccessToken = process.env.MATRIX_ACCESS_TOKEN?.trim();
    const envPassword = process.env.MATRIX_PASSWORD?.trim();
    const envReady = Boolean(envHomeserver && (envAccessToken || (envUserId && envPassword)));

    if (
      envReady &&
      !existing.homeserver &&
      !existing.userId &&
      !existing.accessToken &&
      !existing.password
    ) {
      const useEnv = await prompter.confirm({
        message: "检测到 Matrix 环境变量，是否使用环境变量值？",
        initialValue: true,
      });
      if (useEnv) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            matrix: {
              ...next.channels?.matrix,
              enabled: true,
            },
          },
        };
        if (forceAllowFrom) {
          next = await promptMatrixAllowFrom({ cfg: next, prompter });
        }
        return { cfg: next };
      }
    }

    const homeserver = String(
      await prompter.text({
        message: "Matrix homeserver URL",
        initialValue: existing.homeserver ?? envHomeserver,
        validate: (value) => {
          const raw = String(value ?? "").trim();
          if (!raw) {
            return "必填";
          }
          if (!/^https?:\/\//i.test(raw)) {
            return "请使用完整 URL（https://...）";
          }
          return undefined;
        },
      }),
    ).trim();

    let accessToken = existing.accessToken ?? "";
    let password = existing.password ?? "";
    let userId = existing.userId ?? "";

    if (accessToken || password) {
      const keep = await prompter.confirm({
        message: "Matrix 凭据已配置，是否保留？",
        initialValue: true,
      });
      if (!keep) {
        accessToken = "";
        password = "";
        userId = "";
      }
    }

    if (!accessToken && !password) {
      // Ask auth method FIRST before asking for user ID
      const authMode = await prompter.select({
        message: "Matrix 认证方式",
        options: [
          { value: "token", label: "访问令牌（自动获取用户 ID）" },
          { value: "password", label: "密码（需要用户 ID）" },
        ],
      });

      if (authMode === "token") {
        accessToken = String(
          await prompter.text({
            message: "Matrix 访问令牌",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
        // With access token, we can fetch the userId automatically - don't prompt for it
        // The client.ts will use whoami() to get it
        userId = "";
      } else {
        // Password auth requires user ID upfront
        userId = String(
          await prompter.text({
            message: "Matrix 用户 ID",
            initialValue: existing.userId ?? envUserId,
            validate: (value) => {
              const raw = String(value ?? "").trim();
              if (!raw) {
                return "必填";
              }
              if (!raw.startsWith("@")) {
                return "Matrix 用户 ID 应以 @ 开头";
              }
              if (!raw.includes(":")) {
                return "Matrix 用户 ID 应包含服务器部分（:server）";
              }
              return undefined;
            },
          }),
        ).trim();
        password = String(
          await prompter.text({
            message: "Matrix 密码",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    }

    const deviceName = String(
      await prompter.text({
        message: "Matrix 设备名称（可选）",
        initialValue: existing.deviceName ?? "OpenClaw Gateway",
      }),
    ).trim();

    // Ask about E2EE encryption
    const enableEncryption = await prompter.confirm({
      message: "启用端到端加密（E2EE）？",
      initialValue: existing.encryption ?? false,
    });

    next = {
      ...next,
      channels: {
        ...next.channels,
        matrix: {
          ...next.channels?.matrix,
          enabled: true,
          homeserver,
          userId: userId || undefined,
          accessToken: accessToken || undefined,
          password: password || undefined,
          deviceName: deviceName || undefined,
          encryption: enableEncryption || undefined,
        },
      },
    };

    if (forceAllowFrom) {
      next = await promptMatrixAllowFrom({ cfg: next, prompter });
    }

    const existingGroups = next.channels?.matrix?.groups ?? next.channels?.matrix?.rooms;
    const accessConfig = await promptChannelAccessConfig({
      prompter,
      label: "Matrix rooms",
      currentPolicy: next.channels?.matrix?.groupPolicy ?? "allowlist",
      currentEntries: Object.keys(existingGroups ?? {}),
      placeholder: "!roomId:server, #alias:server, Project Room",
      updatePrompt: Boolean(existingGroups),
    });
    if (accessConfig) {
      if (accessConfig.policy !== "allowlist") {
        next = setMatrixGroupPolicy(next, accessConfig.policy);
      } else {
        let roomKeys = accessConfig.entries;
        if (accessConfig.entries.length > 0) {
          try {
            const resolvedIds: string[] = [];
            const unresolved: string[] = [];
            for (const entry of accessConfig.entries) {
              const trimmed = entry.trim();
              if (!trimmed) {
                continue;
              }
              const cleaned = trimmed.replace(/^(room|channel):/i, "").trim();
              if (cleaned.startsWith("!") && cleaned.includes(":")) {
                resolvedIds.push(cleaned);
                continue;
              }
              const matches = await listMatrixDirectoryGroupsLive({
                cfg: next,
                query: trimmed,
                limit: 10,
              });
              const exact = matches.find(
                (match) => (match.name ?? "").toLowerCase() === trimmed.toLowerCase(),
              );
              const best = exact ?? matches[0];
              if (best?.id) {
                resolvedIds.push(best.id);
              } else {
                unresolved.push(entry);
              }
            }
            roomKeys = [...resolvedIds, ...unresolved.map((entry) => entry.trim()).filter(Boolean)];
            if (resolvedIds.length > 0 || unresolved.length > 0) {
              await prompter.note(
                [
                  resolvedIds.length > 0 ? `已解析：${resolvedIds.join(", ")}` : undefined,
                  unresolved.length > 0
                    ? `未解析（保留原始输入）：${unresolved.join(", ")}`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join("\n"),
                "Matrix 房间",
              );
            }
          } catch (err) {
            await prompter.note(
              `房间查询失败，保留原始输入。${String(err)}`,
              "Matrix 房间",
            );
          }
        }
        next = setMatrixGroupPolicy(next, "allowlist");
        next = setMatrixGroupRooms(next, roomKeys);
      }
    }

    return { cfg: next };
  },
  dmPolicy,
  disable: (cfg) => ({
    ...(cfg as CoreConfig),
    channels: {
      ...(cfg as CoreConfig).channels,
      matrix: { ...(cfg as CoreConfig).channels?.matrix, enabled: false },
    },
  }),
};
