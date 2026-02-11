import type { ChannelAccountSnapshot, ChannelStatusIssue } from "openclaw/plugin-sdk";

type ZalouserAccountStatus = {
  accountId?: unknown;
  enabled?: unknown;
  configured?: unknown;
  dmPolicy?: unknown;
  lastError?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;

function readZalouserAccountStatus(value: ChannelAccountSnapshot): ZalouserAccountStatus | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    accountId: value.accountId,
    enabled: value.enabled,
    configured: value.configured,
    dmPolicy: value.dmPolicy,
    lastError: value.lastError,
  };
}

function isMissingZca(lastError?: string): boolean {
  if (!lastError) {
    return false;
  }
  const lower = lastError.toLowerCase();
  return lower.includes("zca") && (lower.includes("not found") || lower.includes("enoent"));
}

export function collectZalouserStatusIssues(
  accounts: ChannelAccountSnapshot[],
): ChannelStatusIssue[] {
  const issues: ChannelStatusIssue[] = [];
  for (const entry of accounts) {
    const account = readZalouserAccountStatus(entry);
    if (!account) {
      continue;
    }
    const accountId = asString(account.accountId) ?? "default";
    const enabled = account.enabled !== false;
    if (!enabled) {
      continue;
    }

    const configured = account.configured === true;
    const lastError = asString(account.lastError)?.trim();

    if (!configured) {
      if (isMissingZca(lastError)) {
        issues.push({
          channel: "zalouser",
          accountId,
          kind: "runtime",
          message: "在 PATH 中未找到 zca CLI。",
          fix: "安装 zca-cli 并确保其在网关进程的 PATH 中。",
        });
      } else {
        issues.push({
          channel: "zalouser",
          accountId,
          kind: "auth",
          message: "未认证（无 zca 会话）。",
          fix: "运行: openclaw channels login --channel zalouser",
        });
      }
      continue;
    }

    if (account.dmPolicy === "open") {
      issues.push({
        channel: "zalouser",
        accountId,
        kind: "config",
        message: 'Zalo Personal dmPolicy 为 "open"，允许任何用户无需配对即可向机器人发送消息。',
        fix: '将 channels.zalouser.dmPolicy 设置为 "pairing" 或 "allowlist" 以限制访问。',
      });
    }
  }
  return issues;
}
