import type { ChannelAccountSnapshot, ChannelStatusIssue } from "openclaw/plugin-sdk";

type ZaloAccountStatus = {
  accountId?: unknown;
  enabled?: unknown;
  configured?: unknown;
  dmPolicy?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;

function readZaloAccountStatus(value: ChannelAccountSnapshot): ZaloAccountStatus | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    accountId: value.accountId,
    enabled: value.enabled,
    configured: value.configured,
    dmPolicy: value.dmPolicy,
  };
}

export function collectZaloStatusIssues(accounts: ChannelAccountSnapshot[]): ChannelStatusIssue[] {
  const issues: ChannelStatusIssue[] = [];
  for (const entry of accounts) {
    const account = readZaloAccountStatus(entry);
    if (!account) {
      continue;
    }
    const accountId = asString(account.accountId) ?? "default";
    const enabled = account.enabled !== false;
    const configured = account.configured === true;
    if (!enabled || !configured) {
      continue;
    }

    if (account.dmPolicy === "open") {
      issues.push({
        channel: "zalo",
        accountId,
        kind: "config",
        message: 'Zalo dmPolicy 为 "open"，允许任何用户无需配对即可向机器人发送消息。',
        fix: '将 channels.zalo.dmPolicy 设置为 "pairing" 或 "allowlist" 以限制访问。',
      });
    }
  }
  return issues;
}
