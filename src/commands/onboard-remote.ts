import type { OpenClawConfig } from "../config/config.js";
import type { GatewayBonjourBeacon } from "../infra/bonjour-discovery.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { t, ti } from "../i18n/index.js";
import { discoverGatewayBeacons } from "../infra/bonjour-discovery.js";
import { resolveWideAreaDiscoveryDomain } from "../infra/widearea-dns.js";
import { detectBinary } from "./onboard-helpers.js";

const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18789";

function pickHost(beacon: GatewayBonjourBeacon): string | undefined {
  return beacon.tailnetDns || beacon.lanHost || beacon.host;
}

function buildLabel(beacon: GatewayBonjourBeacon): string {
  const host = pickHost(beacon);
  const port = beacon.gatewayPort ?? beacon.port ?? 18789;
  const title = beacon.displayName ?? beacon.instanceName;
  const hint = host ? `${host}:${port}` : "host unknown";
  return `${title} (${hint})`;
}

function ensureWsUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_GATEWAY_URL;
  }
  return trimmed;
}

export async function promptRemoteGatewayConfig(
  cfg: OpenClawConfig,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  let selectedBeacon: GatewayBonjourBeacon | null = null;
  let suggestedUrl = cfg.gateway?.remote?.url ?? DEFAULT_GATEWAY_URL;

  const hasBonjourTool = (await detectBinary("dns-sd")) || (await detectBinary("avahi-browse"));
  const wantsDiscover = hasBonjourTool
    ? await prompter.confirm({
        message: t("wizard", "remote.discoverBonjour", "Discover gateway on LAN (Bonjour)?"),
        initialValue: true,
      })
    : false;

  if (!hasBonjourTool) {
    await prompter.note(
      [
        t(
          "wizard",
          "remote.bonjourRequired",
          "Bonjour discovery requires dns-sd (macOS) or avahi-browse (Linux).",
        ),
        "Docs: https://docs.openclaw.ai/gateway/discovery",
      ].join("\n"),
      t("wizard", "remote.discovery", "Discovery"),
    );
  }

  if (wantsDiscover) {
    const wideAreaDomain = resolveWideAreaDiscoveryDomain({
      configDomain: cfg.discovery?.wideArea?.domain,
    });
    const spin = prompter.progress(
      t("wizard", "remote.searchingGateways", "Searching for gateways…"),
    );
    const beacons = await discoverGatewayBeacons({ timeoutMs: 2000, wideAreaDomain });
    spin.stop(
      beacons.length > 0
        ? ti("wizard", "remote.foundGateways", `Found ${beacons.length} gateway(s)`, {
            count: String(beacons.length),
          })
        : t("wizard", "remote.noGatewaysFound", "No gateways found"),
    );

    if (beacons.length > 0) {
      const selection = await prompter.select({
        message: t("wizard", "remote.selectGateway", "Select gateway"),
        options: [
          ...beacons.map((beacon, index) => ({
            value: String(index),
            label: buildLabel(beacon),
          })),
          { value: "manual", label: t("wizard", "remote.enterUrlManually", "Enter URL manually") },
        ],
      });
      if (selection !== "manual") {
        const idx = Number.parseInt(String(selection), 10);
        selectedBeacon = Number.isFinite(idx) ? (beacons[idx] ?? null) : null;
      }
    }
  }

  if (selectedBeacon) {
    const host = pickHost(selectedBeacon);
    const port = selectedBeacon.gatewayPort ?? 18789;
    if (host) {
      const mode = await prompter.select({
        message: t("wizard", "remote.connectionMethod", "Connection method"),
        options: [
          {
            value: "direct",
            label: ti("wizard", "remote.directGatewayWs", `Direct gateway WS (${host}:${port})`, {
              host,
              port: String(port),
            }),
          },
          { value: "ssh", label: t("wizard", "remote.sshTunnel", "SSH tunnel (loopback)") },
        ],
      });
      if (mode === "direct") {
        suggestedUrl = `ws://${host}:${port}`;
      } else {
        suggestedUrl = DEFAULT_GATEWAY_URL;
        await prompter.note(
          [
            t("wizard", "remote.sshTunnelNote", "Start a tunnel before using the CLI:"),
            `ssh -N -L 18789:127.0.0.1:18789 <user>@${host}${
              selectedBeacon.sshPort ? ` -p ${selectedBeacon.sshPort}` : ""
            }`,
            "Docs: https://docs.openclaw.ai/gateway/remote",
          ].join("\n"),
          t("wizard", "remote.sshTunnelTitle", "SSH tunnel"),
        );
      }
    }
  }

  const urlInput = await prompter.text({
    message: t("wizard", "remote.gatewayWsUrl", "Gateway WebSocket URL"),
    initialValue: suggestedUrl,
    validate: (value) =>
      String(value).trim().startsWith("ws://") || String(value).trim().startsWith("wss://")
        ? undefined
        : t("wizard", "remote.urlMustStartWithWs", "URL must start with ws:// or wss://"),
  });
  const url = ensureWsUrl(String(urlInput));

  const authChoice = await prompter.select({
    message: t("wizard", "remote.gatewayAuth", "Gateway auth"),
    options: [
      { value: "token", label: t("wizard", "remote.tokenRecommended", "Token (recommended)") },
      { value: "off", label: t("wizard", "remote.noAuth", "No auth") },
    ],
  });

  let token = cfg.gateway?.remote?.token ?? "";
  if (authChoice === "token") {
    token = String(
      await prompter.text({
        message: t("wizard", "remote.gatewayToken", "Gateway token"),
        initialValue: token,
        validate: (value) =>
          value?.trim() ? undefined : t("wizard", "remote.required", "Required"),
      }),
    ).trim();
  } else {
    token = "";
  }

  return {
    ...cfg,
    gateway: {
      ...cfg.gateway,
      mode: "remote",
      remote: {
        url,
        token: token || undefined,
      },
    },
  };
}
