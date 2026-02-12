import type { GatewayAuthChoice } from "../commands/onboard-types.js";
import type { GatewayBindMode, GatewayTailscaleMode, OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type {
  GatewayWizardSettings,
  QuickstartGatewayDefaults,
  WizardFlow,
} from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";
import { normalizeGatewayTokenInput, randomToken } from "../commands/onboard-helpers.js";
import { t } from "../i18n/index.js";
import { findTailscaleBinary } from "../infra/tailscale.js";

// These commands are "high risk" (privacy writes/recording) and should be
// explicitly armed by the user when they want to use them.
//
// This only affects what the gateway will accept via node.invoke; the iOS app
// still prompts for OS permissions (camera/photos/contacts/etc) on first use.
const DEFAULT_DANGEROUS_NODE_DENY_COMMANDS = [
  "camera.snap",
  "camera.clip",
  "screen.record",
  "calendar.add",
  "contacts.add",
  "reminders.add",
];

type ConfigureGatewayOptions = {
  flow: WizardFlow;
  baseConfig: OpenClawConfig;
  nextConfig: OpenClawConfig;
  localPort: number;
  quickstartGateway: QuickstartGatewayDefaults;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
};

type ConfigureGatewayResult = {
  nextConfig: OpenClawConfig;
  settings: GatewayWizardSettings;
};

export async function configureGatewayForOnboarding(
  opts: ConfigureGatewayOptions,
): Promise<ConfigureGatewayResult> {
  const { flow, localPort, quickstartGateway, prompter } = opts;
  let { nextConfig } = opts;

  const port =
    flow === "quickstart"
      ? quickstartGateway.port
      : Number.parseInt(
          String(
            await prompter.text({
              message: t("wizard", "gatewayConfig.port", "Gateway port"),
              initialValue: String(localPort),
              validate: (value) =>
                Number.isFinite(Number(value))
                  ? undefined
                  : t("wizard", "gatewayConfig.invalidPort", "Invalid port"),
            }),
          ),
          10,
        );

  let bind: GatewayWizardSettings["bind"] =
    flow === "quickstart"
      ? quickstartGateway.bind
      : await prompter.select<GatewayWizardSettings["bind"]>({
          message: t("wizard", "gatewayConfig.bind", "Gateway bind"),
          options: [
            {
              value: "loopback",
              label: t("wizard", "gatewayConfig.bindLoopback", "Loopback (127.0.0.1)"),
            },
            { value: "lan", label: t("wizard", "gatewayConfig.bindLan", "LAN (0.0.0.0)") },
            {
              value: "tailnet",
              label: t("wizard", "gatewayConfig.bindTailnet", "Tailnet (Tailscale IP)"),
            },
            {
              value: "auto",
              label: t("wizard", "gatewayConfig.bindAuto", "Auto (Loopback → LAN)"),
            },
            { value: "custom", label: t("wizard", "gatewayConfig.bindCustom", "Custom IP") },
          ],
        });

  let customBindHost = quickstartGateway.customBindHost;
  if (bind === "custom") {
    const needsPrompt = flow !== "quickstart" || !customBindHost;
    if (needsPrompt) {
      const input = await prompter.text({
        message: t("wizard", "gatewayConfig.customIpAddress", "Custom IP address"),
        placeholder: "192.168.1.100",
        initialValue: customBindHost ?? "",
        validate: (value) => {
          if (!value) {
            return t(
              "wizard",
              "gatewayConfig.ipRequired",
              "IP address is required for custom bind mode",
            );
          }
          const trimmed = value.trim();
          const parts = trimmed.split(".");
          if (parts.length !== 4) {
            return t(
              "wizard",
              "gatewayConfig.invalidIpv4",
              "Invalid IPv4 address (e.g., 192.168.1.100)",
            );
          }
          if (
            parts.every((part) => {
              const n = parseInt(part, 10);
              return !Number.isNaN(n) && n >= 0 && n <= 255 && part === String(n);
            })
          ) {
            return undefined;
          }
          return t(
            "wizard",
            "gatewayConfig.invalidIpv4Octet",
            "Invalid IPv4 address (each octet must be 0-255)",
          );
        },
      });
      customBindHost = typeof input === "string" ? input.trim() : undefined;
    }
  }

  let authMode =
    flow === "quickstart"
      ? quickstartGateway.authMode
      : ((await prompter.select({
          message: t("wizard", "gatewayConfig.auth", "Gateway auth"),
          options: [
            {
              value: "token",
              label: t("wizard", "gatewayConfig.authToken", "Token"),
              hint: t(
                "wizard",
                "gatewayConfig.authTokenHint",
                "Recommended default (local + remote)",
              ),
            },
            { value: "password", label: t("wizard", "gatewayConfig.authPassword", "Password") },
          ],
          initialValue: "token",
        })) as GatewayAuthChoice);

  const tailscaleMode: GatewayWizardSettings["tailscaleMode"] =
    flow === "quickstart"
      ? quickstartGateway.tailscaleMode
      : await prompter.select<GatewayWizardSettings["tailscaleMode"]>({
          message: t("wizard", "gatewayConfig.tailscaleExposure", "Tailscale exposure"),
          options: [
            {
              value: "off",
              label: t("wizard", "gatewayConfig.tailscaleOff", "Off"),
              hint: t("wizard", "gatewayConfig.tailscaleOffHint", "No Tailscale exposure"),
            },
            {
              value: "serve",
              label: t("wizard", "gatewayConfig.tailscaleServe", "Serve"),
              hint: t(
                "wizard",
                "gatewayConfig.tailscaleServeHint",
                "Private HTTPS for your tailnet (devices on Tailscale)",
              ),
            },
            {
              value: "funnel",
              label: t("wizard", "gatewayConfig.tailscaleFunnel", "Funnel"),
              hint: t(
                "wizard",
                "gatewayConfig.tailscaleFunnelHint",
                "Public HTTPS via Tailscale Funnel (internet)",
              ),
            },
          ],
        });

  // Detect Tailscale binary before proceeding with serve/funnel setup.
  if (tailscaleMode !== "off") {
    const tailscaleBin = await findTailscaleBinary();
    if (!tailscaleBin) {
      await prompter.note(
        [
          t(
            "wizard",
            "gatewayConfig.tailscaleNotFound",
            "Tailscale binary not found in PATH or /Applications.",
          ),
          t("wizard", "gatewayConfig.tailscaleInstallHint", "Ensure Tailscale is installed from:"),
          "  https://tailscale.com/download/mac",
          "",
          t(
            "wizard",
            "gatewayConfig.tailscaleContinueHint",
            "You can continue setup, but serve/funnel will fail at runtime.",
          ),
        ].join("\n"),
        t("wizard", "gatewayConfig.tailscaleWarning", "Tailscale Warning"),
      );
    }
  }

  let tailscaleResetOnExit = flow === "quickstart" ? quickstartGateway.tailscaleResetOnExit : false;
  if (tailscaleMode !== "off" && flow !== "quickstart") {
    await prompter.note(
      ["Docs:", "https://docs.openclaw.ai/gateway/tailscale", "https://docs.openclaw.ai/web"].join(
        "\n",
      ),
      "Tailscale",
    );
    tailscaleResetOnExit = Boolean(
      await prompter.confirm({
        message: t(
          "wizard",
          "gatewayConfig.tailscaleResetOnExit",
          "Reset Tailscale serve/funnel on exit?",
        ),
        initialValue: false,
      }),
    );
  }

  // Safety + constraints:
  // - Tailscale wants bind=loopback so we never expose a non-loopback server + tailscale serve/funnel at once.
  // - Funnel requires password auth.
  if (tailscaleMode !== "off" && bind !== "loopback") {
    await prompter.note(
      t(
        "wizard",
        "gatewayConfig.tailscaleRequiresLoopback",
        "Tailscale requires bind=loopback. Adjusting bind to loopback.",
      ),
      t("wizard", "gatewayConfig.tailscaleNote", "Note"),
    );
    bind = "loopback";
    customBindHost = undefined;
  }

  if (tailscaleMode === "funnel" && authMode !== "password") {
    await prompter.note(
      t(
        "wizard",
        "gatewayConfig.funnelRequiresPassword",
        "Tailscale funnel requires password auth.",
      ),
      t("wizard", "gatewayConfig.tailscaleNote", "Note"),
    );
    authMode = "password";
  }

  let gatewayToken: string | undefined;
  if (authMode === "token") {
    if (flow === "quickstart") {
      gatewayToken = quickstartGateway.token ?? randomToken();
    } else {
      const tokenInput = await prompter.text({
        message: t("wizard", "gatewayConfig.gatewayToken", "Gateway token (blank to generate)"),
        placeholder: t(
          "wizard",
          "gatewayConfig.gatewayTokenPlaceholder",
          "Needed for multi-machine or non-loopback access",
        ),
        initialValue: quickstartGateway.token ?? "",
      });
      gatewayToken = normalizeGatewayTokenInput(tokenInput) || randomToken();
    }
  }

  if (authMode === "password") {
    const password =
      flow === "quickstart" && quickstartGateway.password
        ? quickstartGateway.password
        : await prompter.text({
            message: t("wizard", "gatewayConfig.gatewayPassword", "Gateway password"),
            validate: (value) =>
              value?.trim() ? undefined : t("wizard", "gatewayConfig.passwordRequired", "Required"),
          });
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: {
          ...nextConfig.gateway?.auth,
          mode: "password",
          password: String(password).trim(),
        },
      },
    };
  } else if (authMode === "token") {
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: {
          ...nextConfig.gateway?.auth,
          mode: "token",
          token: gatewayToken,
        },
      },
    };
  }

  nextConfig = {
    ...nextConfig,
    gateway: {
      ...nextConfig.gateway,
      port,
      bind: bind as GatewayBindMode,
      ...(bind === "custom" && customBindHost ? { customBindHost } : {}),
      tailscale: {
        ...nextConfig.gateway?.tailscale,
        mode: tailscaleMode as GatewayTailscaleMode,
        resetOnExit: tailscaleResetOnExit,
      },
    },
  };

  // If this is a new gateway setup (no existing gateway settings), start with a
  // denylist for high-risk node commands. Users can arm these temporarily via
  // /phone arm ... (phone-control plugin).
  if (
    !quickstartGateway.hasExisting &&
    nextConfig.gateway?.nodes?.denyCommands === undefined &&
    nextConfig.gateway?.nodes?.allowCommands === undefined &&
    nextConfig.gateway?.nodes?.browser === undefined
  ) {
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        nodes: {
          ...nextConfig.gateway?.nodes,
          denyCommands: [...DEFAULT_DANGEROUS_NODE_DENY_COMMANDS],
        },
      },
    };
  }

  return {
    nextConfig,
    settings: {
      port,
      bind: bind as GatewayBindMode,
      customBindHost: bind === "custom" ? customBindHost : undefined,
      authMode,
      gatewayToken,
      tailscaleMode: tailscaleMode as GatewayTailscaleMode,
      tailscaleResetOnExit,
    },
  };
}
