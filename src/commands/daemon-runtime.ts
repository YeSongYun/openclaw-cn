import { t } from "../i18n/index.js";

export type GatewayDaemonRuntime = "node" | "bun";

export const DEFAULT_GATEWAY_DAEMON_RUNTIME: GatewayDaemonRuntime = "node";

export const GATEWAY_DAEMON_RUNTIME_OPTIONS: Array<{
  value: GatewayDaemonRuntime;
  label: string;
  hint?: string;
}> = [
  {
    value: "node",
    label: t("wizard", "daemon.nodeRecommended", "Node (recommended)"),
    hint: t(
      "wizard",
      "daemon.nodeHint",
      "Required for WhatsApp + Telegram. Bun can corrupt memory on reconnect.",
    ),
  },
];

export function isGatewayDaemonRuntime(value: string | undefined): value is GatewayDaemonRuntime {
  return value === "node" || value === "bun";
}
