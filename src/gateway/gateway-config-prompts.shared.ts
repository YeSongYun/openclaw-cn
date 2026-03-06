import type { OpenClawConfig } from "../config/config.js";
import { t } from "../i18n/index.js";
import { getTailnetHostname } from "../infra/tailscale.js";
import { isIpv6Address, parseCanonicalIpAddress } from "../shared/net/ip.js";

export function getTailscaleExposureOptions(): Array<{
  value: "off" | "serve" | "funnel";
  label: string;
  hint: string;
}> {
  return [
    {
      value: "off",
      label: t("configure", "gateway.tailscaleOffLabel", "Off"),
      hint: t("configure", "gateway.tailscaleOffHint", "No Tailscale exposure"),
    },
    {
      value: "serve",
      label: t("configure", "gateway.tailscaleServeLabel", "Serve"),
      hint: t(
        "configure",
        "gateway.tailscaleServeHint",
        "Private HTTPS for your tailnet (devices on Tailscale)",
      ),
    },
    {
      value: "funnel",
      label: t("configure", "gateway.tailscaleFunnelLabel", "Funnel"),
      hint: t(
        "configure",
        "gateway.tailscaleFunnelHint",
        "Public HTTPS via Tailscale Funnel (internet)",
      ),
    },
  ];
}

export function getTailscaleMissingBinNote(): string {
  return t(
    "configure",
    "gateway.tailscaleMissingBin",
    "Tailscale binary not found in PATH or /Applications.\nEnsure Tailscale is installed from:\n  https://tailscale.com/download/mac\n\nYou can continue setup, but serve/funnel will fail at runtime.",
  );
}

export function getTailscaleDocsNote(): string {
  return t(
    "configure",
    "gateway.tailscaleDocs",
    "Docs:\nhttps://docs.openclaw.ai/gateway/tailscale\nhttps://docs.openclaw.ai/web",
  );
}

function normalizeTailnetHostForUrl(rawHost: string): string | null {
  const trimmed = rawHost.trim().replace(/\.$/, "");
  if (!trimmed) {
    return null;
  }
  const parsed = parseCanonicalIpAddress(trimmed);
  if (parsed && isIpv6Address(parsed)) {
    return `[${parsed.toString().toLowerCase()}]`;
  }
  return trimmed;
}

export function buildTailnetHttpsOrigin(rawHost: string): string | null {
  const normalizedHost = normalizeTailnetHostForUrl(rawHost);
  if (!normalizedHost) {
    return null;
  }
  try {
    return new URL(`https://${normalizedHost}`).origin;
  } catch {
    return null;
  }
}

export function appendAllowedOrigin(existing: string[] | undefined, origin: string): string[] {
  const current = existing ?? [];
  const normalized = origin.toLowerCase();
  if (current.some((entry) => entry.toLowerCase() === normalized)) {
    return current;
  }
  return [...current, origin];
}

export async function maybeAddTailnetOriginToControlUiAllowedOrigins(params: {
  config: OpenClawConfig;
  tailscaleMode: string;
  tailscaleBin?: string | null;
}): Promise<OpenClawConfig> {
  if (params.tailscaleMode !== "serve" && params.tailscaleMode !== "funnel") {
    return params.config;
  }
  const tsOrigin = await getTailnetHostname(undefined, params.tailscaleBin ?? undefined)
    .then((host) => buildTailnetHttpsOrigin(host))
    .catch(() => null);
  if (!tsOrigin) {
    return params.config;
  }

  const existing = params.config.gateway?.controlUi?.allowedOrigins ?? [];
  const updatedOrigins = appendAllowedOrigin(existing, tsOrigin);
  return {
    ...params.config,
    gateway: {
      ...params.config.gateway,
      controlUi: {
        ...params.config.gateway?.controlUi,
        allowedOrigins: updatedOrigins,
      },
    },
  };
}
