import type { OpenClawConfig } from "../config/config.js";
import type { SecretInput } from "../config/types.secrets.js";
import { isSecureWebSocketUrl } from "../gateway/net.js";
import { to, toi } from "../i18n/index.js";
import type { GatewayBonjourBeacon } from "../infra/bonjour-discovery.js";
import { discoverGatewayBeacons } from "../infra/bonjour-discovery.js";
import { resolveWideAreaDiscoveryDomain } from "../infra/widearea-dns.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import {
  promptSecretRefForOnboarding,
  resolveSecretInputModeForEnvSelection,
} from "./auth-choice.apply-helpers.js";
import { detectBinary } from "./onboard-helpers.js";
import type { SecretInputMode } from "./onboard-types.js";

const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18789";

function pickHost(beacon: GatewayBonjourBeacon): string | undefined {
  // Security: TXT is unauthenticated. Prefer the resolved service endpoint host.
  return beacon.host || beacon.tailnetDns || beacon.lanHost;
}

function buildLabel(beacon: GatewayBonjourBeacon): string {
  const host = pickHost(beacon);
  // Security: Prefer the resolved service endpoint port.
  const port = beacon.port ?? beacon.gatewayPort ?? 18789;
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

function validateGatewayWebSocketUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("ws://") && !trimmed.startsWith("wss://")) {
    return to("remote.urlMustStartWs", "URL must start with ws:// or wss://");
  }
  if (
    !isSecureWebSocketUrl(trimmed, {
      allowPrivateWs: process.env.OPENCLAW_ALLOW_INSECURE_PRIVATE_WS === "1",
    })
  ) {
    return to(
      "remote.useWssForRemote",
      "Use wss:// for remote hosts, or ws://127.0.0.1/localhost via SSH tunnel. " +
        "Break-glass: OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 for trusted private networks.",
    );
  }
  return undefined;
}

export async function promptRemoteGatewayConfig(
  cfg: OpenClawConfig,
  prompter: WizardPrompter,
  options?: { secretInputMode?: SecretInputMode },
): Promise<OpenClawConfig> {
  let selectedBeacon: GatewayBonjourBeacon | null = null;
  let suggestedUrl = cfg.gateway?.remote?.url ?? DEFAULT_GATEWAY_URL;

  const hasBonjourTool = (await detectBinary("dns-sd")) || (await detectBinary("avahi-browse"));
  const wantsDiscover = hasBonjourTool
    ? await prompter.confirm({
        message: to("remote.discoverBonjour", "Discover gateway on LAN (Bonjour)?"),
        initialValue: true,
      })
    : false;

  if (!hasBonjourTool) {
    await prompter.note(
      to(
        "remote.discoveryNote",
        "Bonjour discovery requires dns-sd (macOS) or avahi-browse (Linux).\nDocs: https://docs.openclaw.ai/gateway/discovery",
      ),
      to("remote.discoveryTitle", "Discovery"),
    );
  }

  if (wantsDiscover) {
    const wideAreaDomain = resolveWideAreaDiscoveryDomain({
      configDomain: cfg.discovery?.wideArea?.domain,
    });
    const spin = prompter.progress(to("remote.searching", "Searching for gateways…"));
    const beacons = await discoverGatewayBeacons({ timeoutMs: 2000, wideAreaDomain });
    spin.stop(
      beacons.length > 0
        ? toi("remote.found", "Found {count} gateway(s)", { count: String(beacons.length) })
        : to("remote.notFound", "No gateways found"),
    );

    if (beacons.length > 0) {
      const selection = await prompter.select({
        message: to("remote.selectGateway", "Select gateway"),
        options: [
          ...beacons.map((beacon, index) => ({
            value: String(index),
            label: buildLabel(beacon),
          })),
          { value: "manual", label: to("remote.enterManually", "Enter URL manually") },
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
    const port = selectedBeacon.port ?? selectedBeacon.gatewayPort ?? 18789;
    if (host) {
      const mode = await prompter.select({
        message: to("remote.connectionMethod", "Connection method"),
        options: [
          {
            value: "direct",
            label: toi("remote.directWs", "Direct gateway WS ({endpoint})", {
              endpoint: `${host}:${port}`,
            }),
          },
          { value: "ssh", label: to("remote.sshTunnel", "SSH tunnel (loopback)") },
        ],
      });
      if (mode === "direct") {
        suggestedUrl = `wss://${host}:${port}`;
        await prompter.note(
          toi(
            "remote.directRemoteNote",
            "Direct remote access defaults to TLS.\nUsing: {url}\nIf your gateway is loopback-only, choose SSH tunnel and keep ws://127.0.0.1:18789.",
            { url: suggestedUrl },
          ),
          to("remote.directRemoteTitle", "Direct remote"),
        );
      } else {
        suggestedUrl = DEFAULT_GATEWAY_URL;
        const sshCmd = `ssh -N -L 18789:127.0.0.1:18789 <user>@${host}${
          selectedBeacon.sshPort ? ` -p ${selectedBeacon.sshPort}` : ""
        }`;
        await prompter.note(
          toi(
            "remote.sshTunnelNote",
            "Start a tunnel before using the CLI:\n{sshCmd}\nDocs: https://docs.openclaw.ai/gateway/remote",
            { sshCmd },
          ),
          to("remote.sshTunnelTitle", "SSH tunnel"),
        );
      }
    }
  }

  const urlInput = await prompter.text({
    message: to("remote.gatewayWsUrl", "Gateway WebSocket URL"),
    initialValue: suggestedUrl,
    validate: (value) => validateGatewayWebSocketUrl(String(value)),
  });
  const url = ensureWsUrl(String(urlInput));

  const authChoice = await prompter.select({
    message: to("remote.gatewayAuth", "Gateway auth"),
    options: [
      { value: "token", label: to("remote.authToken", "Token (recommended)") },
      { value: "password", label: to("remote.authPassword", "Password") },
      { value: "off", label: to("remote.authNone", "No auth") },
    ],
  });

  let token: SecretInput | undefined = cfg.gateway?.remote?.token;
  let password: SecretInput | undefined = cfg.gateway?.remote?.password;
  if (authChoice === "token") {
    const selectedMode = await resolveSecretInputModeForEnvSelection({
      prompter,
      explicitMode: options?.secretInputMode,
      copy: {
        modeMessage: to(
          "remote.tokenModeMessage",
          "How do you want to provide this gateway token?",
        ),
        plaintextLabel: to("remote.tokenPlaintextLabel", "Enter token now"),
        plaintextHint: to(
          "remote.tokenPlaintextHint",
          "Stores the token directly in OpenClaw config",
        ),
      },
    });
    if (selectedMode === "ref") {
      const resolved = await promptSecretRefForOnboarding({
        provider: "gateway-remote-token",
        config: cfg,
        prompter,
        preferredEnvVar: "OPENCLAW_GATEWAY_TOKEN",
        copy: {
          sourceMessage: to("remote.tokenSourceMessage", "Where is this gateway token stored?"),
          envVarPlaceholder: "OPENCLAW_GATEWAY_TOKEN",
        },
      });
      token = resolved.ref;
    } else {
      token = String(
        await prompter.text({
          message: to("remote.gatewayToken", "Gateway token"),
          initialValue: typeof token === "string" ? token : undefined,
          validate: (value) => (value?.trim() ? undefined : to("remote.required", "Required")),
        }),
      ).trim();
    }
    password = undefined;
  } else if (authChoice === "password") {
    const selectedMode = await resolveSecretInputModeForEnvSelection({
      prompter,
      explicitMode: options?.secretInputMode,
      copy: {
        modeMessage: to(
          "remote.passwordModeMessage",
          "How do you want to provide this gateway password?",
        ),
        plaintextLabel: to("remote.passwordPlaintextLabel", "Enter password now"),
        plaintextHint: to(
          "remote.passwordPlaintextHint",
          "Stores the password directly in OpenClaw config",
        ),
      },
    });
    if (selectedMode === "ref") {
      const resolved = await promptSecretRefForOnboarding({
        provider: "gateway-remote-password",
        config: cfg,
        prompter,
        preferredEnvVar: "OPENCLAW_GATEWAY_PASSWORD",
        copy: {
          sourceMessage: to(
            "remote.passwordSourceMessage",
            "Where is this gateway password stored?",
          ),
          envVarPlaceholder: "OPENCLAW_GATEWAY_PASSWORD",
        },
      });
      password = resolved.ref;
    } else {
      password = String(
        await prompter.text({
          message: to("remote.gatewayPassword", "Gateway password"),
          initialValue: typeof password === "string" ? password : undefined,
          validate: (value) => (value?.trim() ? undefined : to("remote.required", "Required")),
        }),
      ).trim();
    }
    token = undefined;
  } else {
    token = undefined;
    password = undefined;
  }

  return {
    ...cfg,
    gateway: {
      ...cfg.gateway,
      mode: "remote",
      remote: {
        url,
        ...(token !== undefined ? { token } : {}),
        ...(password !== undefined ? { password } : {}),
      },
    },
  };
}
