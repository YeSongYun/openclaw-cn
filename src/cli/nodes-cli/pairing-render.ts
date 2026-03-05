import { formatTimeAgo } from "../../infra/format-time/format-relative.ts";
import { renderTable } from "../../terminal/table.js";
import type { PendingRequest } from "./types.js";

export function renderPendingPairingRequestsTable(params: {
  pending: PendingRequest[];
  now: number;
  tableWidth: number;
  theme: {
    heading: (text: string) => string;
    warn: (text: string) => string;
    muted: (text: string) => string;
  };
}) {
  const { pending, now, tableWidth, theme } = params;
  const rows = pending.map((r) => ({
    Request: r.requestId,
    Node: r.displayName?.trim() ? r.displayName.trim() : r.nodeId,
    IP: r.remoteIp ?? "",
    Requested:
      typeof r.ts === "number" ? formatTimeAgo(Math.max(0, now - r.ts)) : theme.muted("unknown"),
    Repair: r.isRepair ? theme.warn("yes") : "",
  }));
  return {
    heading: theme.heading("Pending"),
    table: renderTable({
      width: tableWidth,
      columns: [
        {
          key: "Request",
          header: "Request",
          headerI18n: { ns: "cli", key: "table.request" },
          minWidth: 8,
        },
        {
          key: "Node",
          header: "Node",
          headerI18n: { ns: "cli", key: "table.node" },
          minWidth: 14,
          flex: true,
        },
        { key: "IP", header: "IP", headerI18n: { ns: "cli", key: "table.ip" }, minWidth: 10 },
        {
          key: "Requested",
          header: "Requested",
          headerI18n: { ns: "cli", key: "table.requested" },
          minWidth: 12,
        },
        {
          key: "Repair",
          header: "Repair",
          headerI18n: { ns: "cli", key: "table.repair" },
          minWidth: 6,
        },
      ],
      rows,
    }).trimEnd(),
  };
}
