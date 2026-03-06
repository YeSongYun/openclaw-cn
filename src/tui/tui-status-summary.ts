import { tt, tti } from "../i18n/index.js";
import { formatTimeAgo } from "../infra/format-time/format-relative.ts";
import { formatTokenCount } from "../utils/usage-format.js";
import { formatContextUsageLine } from "./tui-formatters.js";
import type { GatewayStatusSummary } from "./tui-types.js";

export function formatStatusSummary(summary: GatewayStatusSummary) {
  const lines: string[] = [];
  lines.push(tt("status.title", "Gateway status"));

  if (!summary.linkChannel) {
    lines.push(tt("status.linkUnknown", "Link channel: unknown"));
  } else {
    const linkLabel = summary.linkChannel.label ?? tt("status.linkDefault", "Link channel");
    const linked = summary.linkChannel.linked === true;
    const authAge =
      linked && typeof summary.linkChannel.authAgeMs === "number"
        ? ` ${tti("status.lastRefreshed", "(last refreshed {time})", { time: formatTimeAgo(summary.linkChannel.authAgeMs) })}`
        : "";
    const linkedText = linked
      ? tt("status.linked", "linked")
      : tt("status.notLinked", "not linked");
    lines.push(`${linkLabel}: ${linkedText}${authAge}`);
  }

  const providerSummary = Array.isArray(summary.providerSummary) ? summary.providerSummary : [];
  if (providerSummary.length > 0) {
    lines.push("");
    lines.push(tt("status.system", "System:"));
    for (const line of providerSummary) {
      lines.push(`  ${line}`);
    }
  }

  const heartbeatAgents = summary.heartbeat?.agents ?? [];
  if (heartbeatAgents.length > 0) {
    const heartbeatParts = heartbeatAgents.map((agent) => {
      const agentId = agent.agentId ?? "unknown";
      if (!agent.enabled || !agent.everyMs) {
        return `disabled (${agentId})`;
      }
      return `${agent.every ?? "unknown"} (${agentId})`;
    });
    lines.push("");
    lines.push(tti("status.heartbeat", "Heartbeat: {parts}", { parts: heartbeatParts.join(", ") }));
  }

  const sessionPaths = summary.sessions?.paths ?? [];
  if (sessionPaths.length === 1) {
    lines.push(
      tti("status.sessionStore", "Session store: {path}", { path: sessionPaths[0] ?? "" }),
    );
  } else if (sessionPaths.length > 1) {
    lines.push(
      tti("status.sessionStores", "Session stores: {count}", { count: sessionPaths.length }),
    );
  }

  const defaults = summary.sessions?.defaults;
  const defaultModel = defaults?.model ?? "unknown";
  const defaultCtx =
    typeof defaults?.contextTokens === "number"
      ? ` (${formatTokenCount(defaults.contextTokens)} ctx)`
      : "";
  lines.push(
    tti("status.defaultModel", "Default model: {model}{ctx}", {
      model: defaultModel,
      ctx: defaultCtx,
    }),
  );

  const sessionCount = summary.sessions?.count ?? 0;
  lines.push(tti("status.activeSessions", "Active sessions: {count}", { count: sessionCount }));

  const recent = Array.isArray(summary.sessions?.recent) ? summary.sessions?.recent : [];
  if (recent.length > 0) {
    lines.push(tt("status.recentSessions", "Recent sessions:"));
    for (const entry of recent) {
      const ageLabel = typeof entry.age === "number" ? formatTimeAgo(entry.age) : "no activity";
      const model = entry.model ?? "unknown";
      const usage = formatContextUsageLine({
        total: entry.totalTokens ?? null,
        context: entry.contextTokens ?? null,
        remaining: entry.remainingTokens ?? null,
        percent: entry.percentUsed ?? null,
      });
      const flags = entry.flags?.length ? ` | flags: ${entry.flags.join(", ")}` : "";
      lines.push(
        `- ${entry.key}${entry.kind ? ` [${entry.kind}]` : ""} | ${ageLabel} | model ${model} | ${usage}${flags}`,
      );
    }
  }

  const queued = Array.isArray(summary.queuedSystemEvents) ? summary.queuedSystemEvents : [];
  if (queued.length > 0) {
    const preview = queued.slice(0, 3).join(" | ");
    lines.push(
      tti("status.queuedEvents", "Queued system events ({count}): {preview}", {
        count: queued.length,
        preview,
      }),
    );
  }

  return lines;
}
