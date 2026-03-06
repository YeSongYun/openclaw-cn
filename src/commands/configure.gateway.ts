import type { OpenClawConfig } from "../config/config.js";
import { resolveGatewayPort } from "../config/config.js";
import {
  getTailscaleDocsNote,
  getTailscaleExposureOptions,
  getTailscaleMissingBinNote,
  maybeAddTailnetOriginToControlUiAllowedOrigins,
} from "../gateway/gateway-config-prompts.shared.js";
import { tcfg } from "../i18n/index.js";
import { findTailscaleBinary } from "../infra/tailscale.js";
import type { RuntimeEnv } from "../runtime.js";
import { validateIPv4AddressInput } from "../shared/net/ipv4.js";
import { note } from "../terminal/note.js";
import { buildGatewayAuthConfig } from "./configure.gateway-auth.js";
import { confirm, select, text } from "./configure.shared.js";
import {
  guardCancel,
  normalizeGatewayTokenInput,
  randomToken,
  validateGatewayPasswordInput,
} from "./onboard-helpers.js";

type GatewayAuthChoice = "token" | "password" | "trusted-proxy";

export async function promptGatewayConfig(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
): Promise<{
  config: OpenClawConfig;
  port: number;
  token?: string;
}> {
  const portRaw = guardCancel(
    await text({
      message: tcfg("gateway.portPrompt", "Gateway port"),
      initialValue: String(resolveGatewayPort(cfg)),
      validate: (value) =>
        Number.isFinite(Number(value)) ? undefined : tcfg("gateway.invalidPort", "Invalid port"),
    }),
    runtime,
  );
  const port = Number.parseInt(String(portRaw), 10);

  let bind = guardCancel(
    await select({
      message: tcfg("gateway.bindMode", "Gateway bind mode"),
      options: [
        {
          value: "loopback",
          label: tcfg("gateway.bindLoopbackLabel", "Loopback (Local only)"),
          hint: tcfg("gateway.bindLoopbackHint", "Bind to 127.0.0.1 - secure, local-only access"),
        },
        {
          value: "tailnet",
          label: tcfg("gateway.bindTailnetLabel", "Tailnet (Tailscale IP)"),
          hint: tcfg("gateway.bindTailnetHint", "Bind to your Tailscale IP only (100.x.x.x)"),
        },
        {
          value: "auto",
          label: tcfg("gateway.bindAutoLabel", "Auto (Loopback → LAN)"),
          hint: tcfg(
            "gateway.bindAutoHint",
            "Prefer loopback; fall back to all interfaces if unavailable",
          ),
        },
        {
          value: "lan",
          label: tcfg("gateway.bindLanLabel", "LAN (All interfaces)"),
          hint: tcfg(
            "gateway.bindLanHint",
            "Bind to 0.0.0.0 - accessible from anywhere on your network",
          ),
        },
        {
          value: "custom",
          label: tcfg("gateway.bindCustomLabel", "Custom IP"),
          hint: tcfg(
            "gateway.bindCustomHint",
            "Specify a specific IP address, with 0.0.0.0 fallback if unavailable",
          ),
        },
      ],
    }),
    runtime,
  );

  let customBindHost: string | undefined;
  if (bind === "custom") {
    const input = guardCancel(
      await text({
        message: tcfg("gateway.customIpPrompt", "Custom IP address"),
        placeholder: "192.168.1.100",
        validate: validateIPv4AddressInput,
      }),
      runtime,
    );
    customBindHost = typeof input === "string" ? input : undefined;
  }

  let authMode = guardCancel(
    await select({
      message: tcfg("gateway.authMode", "Gateway auth"),
      options: [
        {
          value: "token",
          label: tcfg("gateway.authTokenLabel", "Token"),
          hint: tcfg("gateway.authTokenHint", "Recommended default"),
        },
        { value: "password", label: tcfg("gateway.authPasswordLabel", "Password") },
        {
          value: "trusted-proxy",
          label: tcfg("gateway.authTrustedProxyLabel", "Trusted Proxy"),
          hint: tcfg(
            "gateway.authTrustedProxyHint",
            "Behind reverse proxy (Pomerium, Caddy, Traefik, etc.)",
          ),
        },
      ],
      initialValue: "token",
    }),
    runtime,
  ) as GatewayAuthChoice;

  let tailscaleMode = guardCancel(
    await select({
      message: tcfg("gateway.tailscaleExposure", "Tailscale exposure"),
      options: getTailscaleExposureOptions(),
    }),
    runtime,
  );

  // Detect Tailscale binary before proceeding with serve/funnel setup.
  // Persist the path so getTailnetHostname can reuse it for origin injection.
  let tailscaleBin: string | null = null;
  if (tailscaleMode !== "off") {
    tailscaleBin = await findTailscaleBinary();
    if (!tailscaleBin) {
      note(getTailscaleMissingBinNote(), tcfg("gateway.tailscaleWarning", "Tailscale Warning"));
    }
  }

  let tailscaleResetOnExit = false;
  if (tailscaleMode !== "off") {
    note(getTailscaleDocsNote(), tcfg("gateway.tailscaleTitle", "Tailscale"));
    tailscaleResetOnExit = Boolean(
      guardCancel(
        await confirm({
          message: tcfg("gateway.tailscaleResetOnExit", "Reset Tailscale serve/funnel on exit?"),
          initialValue: false,
        }),
        runtime,
      ),
    );
  }

  if (tailscaleMode !== "off" && bind !== "loopback") {
    note(
      tcfg(
        "gateway.noteLoopbackAdjust",
        "Tailscale requires bind=loopback. Adjusting bind to loopback.",
      ),
      tcfg("gateway.noteTitle", "Note"),
    );
    bind = "loopback";
  }

  if (tailscaleMode === "funnel" && authMode !== "password") {
    note(
      tcfg("gateway.noteFunnelNeedsPassword", "Tailscale funnel requires password auth."),
      tcfg("gateway.noteTitle", "Note"),
    );
    authMode = "password";
  }

  // trusted-proxy + loopback is valid when the reverse proxy runs on the same
  // host (e.g. cloudflared, nginx, Caddy). trustedProxies must include 127.0.0.1.
  if (authMode === "trusted-proxy" && tailscaleMode !== "off") {
    note(
      tcfg(
        "gateway.noteTrustedProxyIncompatible",
        "Trusted proxy auth is incompatible with Tailscale serve/funnel. Disabling Tailscale.",
      ),
      tcfg("gateway.noteTitle", "Note"),
    );
    tailscaleMode = "off";
    tailscaleResetOnExit = false;
  }

  let gatewayToken: string | undefined;
  let gatewayPassword: string | undefined;
  let trustedProxyConfig:
    | { userHeader: string; requiredHeaders?: string[]; allowUsers?: string[] }
    | undefined;
  let trustedProxies: string[] | undefined;
  let next = cfg;

  if (authMode === "token") {
    const tokenInput = guardCancel(
      await text({
        message: tcfg("gateway.tokenPrompt", "Gateway token (blank to generate)"),
        initialValue: randomToken(),
      }),
      runtime,
    );
    gatewayToken = normalizeGatewayTokenInput(tokenInput) || randomToken();
  }

  if (authMode === "password") {
    const password = guardCancel(
      await text({
        message: tcfg("gateway.passwordPrompt", "Gateway password"),
        validate: validateGatewayPasswordInput,
      }),
      runtime,
    );
    gatewayPassword = String(password ?? "").trim();
  }

  if (authMode === "trusted-proxy") {
    note(
      tcfg(
        "gateway.trustedProxyNote",
        "Trusted proxy mode: OpenClaw trusts user identity from a reverse proxy.\nThe proxy must authenticate users and pass identity via headers.\nOnly requests from specified proxy IPs will be trusted.\n\nCommon use cases: Pomerium, Caddy + OAuth, Traefik + forward auth\nDocs: https://docs.openclaw.ai/gateway/trusted-proxy-auth",
      ),
      tcfg("gateway.trustedProxyTitle", "Trusted Proxy Auth"),
    );

    const userHeader = guardCancel(
      await text({
        message: tcfg("gateway.userHeaderPrompt", "Header containing user identity"),
        placeholder: "x-forwarded-user",
        initialValue: "x-forwarded-user",
        validate: (value) =>
          value?.trim() ? undefined : tcfg("gateway.userHeaderRequired", "User header is required"),
      }),
      runtime,
    );

    const requiredHeadersRaw = guardCancel(
      await text({
        message: tcfg(
          "gateway.requiredHeadersPrompt",
          "Required headers (comma-separated, optional)",
        ),
        placeholder: "x-forwarded-proto,x-forwarded-host",
      }),
      runtime,
    );
    const requiredHeaders = requiredHeadersRaw
      ? String(requiredHeadersRaw)
          .split(",")
          .map((h) => h.trim())
          .filter(Boolean)
      : [];

    const allowUsersRaw = guardCancel(
      await text({
        message: tcfg(
          "gateway.allowedUsersPrompt",
          "Allowed users (comma-separated, blank = all authenticated users)",
        ),
        placeholder: "nick@example.com,admin@company.com",
      }),
      runtime,
    );
    const allowUsers = allowUsersRaw
      ? String(allowUsersRaw)
          .split(",")
          .map((u) => u.trim())
          .filter(Boolean)
      : [];

    const trustedProxiesRaw = guardCancel(
      await text({
        message: tcfg("gateway.trustedProxyIpsPrompt", "Trusted proxy IPs (comma-separated)"),
        placeholder: "10.0.1.10,192.168.1.5",
        validate: (value) => {
          if (!value || String(value).trim() === "") {
            return tcfg(
              "gateway.trustedProxyIpsRequired",
              "At least one trusted proxy IP is required",
            );
          }
          return undefined;
        },
      }),
      runtime,
    );
    trustedProxies = String(trustedProxiesRaw)
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);

    trustedProxyConfig = {
      userHeader: String(userHeader).trim(),
      requiredHeaders: requiredHeaders.length > 0 ? requiredHeaders : undefined,
      allowUsers: allowUsers.length > 0 ? allowUsers : undefined,
    };
  }

  const authConfig = buildGatewayAuthConfig({
    existing: next.gateway?.auth,
    mode: authMode,
    token: gatewayToken,
    password: gatewayPassword,
    trustedProxy: trustedProxyConfig,
  });

  next = {
    ...next,
    gateway: {
      ...next.gateway,
      mode: "local",
      port,
      bind,
      auth: authConfig,
      ...(customBindHost && { customBindHost }),
      ...(trustedProxies && { trustedProxies }),
      tailscale: {
        ...next.gateway?.tailscale,
        mode: tailscaleMode,
        resetOnExit: tailscaleResetOnExit,
      },
    },
  };

  next = await maybeAddTailnetOriginToControlUiAllowedOrigins({
    config: next,
    tailscaleMode,
    tailscaleBin,
  });

  return { config: next, port, token: gatewayToken };
}
