import fs from "node:fs/promises";
import path from "node:path";
import type { OnboardOptions } from "../commands/onboard-types.js";
import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { GatewayWizardSettings, WizardFlow } from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";
import { DEFAULT_BOOTSTRAP_FILENAME } from "../agents/workspace.js";
import { formatCliCommand } from "../cli/command-format.js";
import {
  buildGatewayInstallPlan,
  gatewayInstallErrorHint,
} from "../commands/daemon-install-helpers.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  GATEWAY_DAEMON_RUNTIME_OPTIONS,
} from "../commands/daemon-runtime.js";
import { formatHealthCheckFailure } from "../commands/health-format.js";
import { healthCommand } from "../commands/health.js";
import {
  detectBrowserOpenSupport,
  formatControlUiSshHint,
  openUrl,
  probeGatewayReachable,
  waitForGatewayReachable,
  resolveControlUiLinks,
} from "../commands/onboard-helpers.js";
import { resolveGatewayService } from "../daemon/service.js";
import { isSystemdUserServiceAvailable } from "../daemon/systemd.js";
import { t, ti } from "../i18n/index.js";
import { ensureControlUiAssetsBuilt } from "../infra/control-ui-assets.js";
import { restoreTerminalState } from "../terminal/restore.js";
import { runTui } from "../tui/tui.js";
import { resolveUserPath } from "../utils.js";
import { setupOnboardingShellCompletion } from "./onboarding.completion.js";

type FinalizeOnboardingOptions = {
  flow: WizardFlow;
  opts: OnboardOptions;
  baseConfig: OpenClawConfig;
  nextConfig: OpenClawConfig;
  workspaceDir: string;
  settings: GatewayWizardSettings;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
};

export async function finalizeOnboardingWizard(
  options: FinalizeOnboardingOptions,
): Promise<{ launchedTui: boolean }> {
  const { flow, opts, baseConfig, nextConfig, settings, prompter, runtime } = options;

  const withWizardProgress = async <T>(
    label: string,
    options: { doneMessage?: string },
    work: (progress: { update: (message: string) => void }) => Promise<T>,
  ): Promise<T> => {
    const progress = prompter.progress(label);
    try {
      return await work(progress);
    } finally {
      progress.stop(options.doneMessage);
    }
  };

  const systemdAvailable =
    process.platform === "linux" ? await isSystemdUserServiceAvailable() : true;
  if (process.platform === "linux" && !systemdAvailable) {
    await prompter.note(
      t(
        "wizard",
        "finalize.systemdUnavailable",
        "Systemd user services are unavailable. Skipping lingering checks and service install.",
      ),
      t("wizard", "systemd.title", "Systemd"),
    );
  }

  if (process.platform === "linux" && systemdAvailable) {
    const { ensureSystemdUserLingerInteractive } = await import("../commands/systemd-linger.js");
    await ensureSystemdUserLingerInteractive({
      runtime,
      prompter: {
        confirm: prompter.confirm,
        note: prompter.note,
      },
      reason:
        "Linux installs use a systemd user service by default. Without lingering, systemd stops the user session on logout/idle and kills the Gateway.",
      requireConfirm: false,
    });
  }

  const explicitInstallDaemon =
    typeof opts.installDaemon === "boolean" ? opts.installDaemon : undefined;
  let installDaemon: boolean;
  if (explicitInstallDaemon !== undefined) {
    installDaemon = explicitInstallDaemon;
  } else if (process.platform === "linux" && !systemdAvailable) {
    installDaemon = false;
  } else if (flow === "quickstart") {
    installDaemon = true;
  } else {
    installDaemon = await prompter.confirm({
      message: t(
        "wizard",
        "finalize.installGatewayService",
        "Install Gateway service (recommended)",
      ),
      initialValue: true,
    });
  }

  if (process.platform === "linux" && !systemdAvailable && installDaemon) {
    await prompter.note(
      t(
        "wizard",
        "finalize.systemdUnavailableSkip",
        "Systemd user services are unavailable; skipping service install. Use your container supervisor or `docker compose up -d`.",
      ),
      t("wizard", "finalize.gatewayService", "Gateway service"),
    );
    installDaemon = false;
  }

  if (installDaemon) {
    const daemonRuntime =
      flow === "quickstart"
        ? DEFAULT_GATEWAY_DAEMON_RUNTIME
        : await prompter.select({
            message: t("wizard", "finalize.gatewayServiceRuntime", "Gateway service runtime"),
            options: GATEWAY_DAEMON_RUNTIME_OPTIONS,
            initialValue: opts.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME,
          });
    if (flow === "quickstart") {
      await prompter.note(
        t(
          "wizard",
          "finalize.quickstartNodeNote",
          "QuickStart uses Node for the Gateway service (stable + supported).",
        ),
        t("wizard", "finalize.gatewayServiceRuntimeTitle", "Gateway service runtime"),
      );
    }
    const service = resolveGatewayService();
    const loaded = await service.isLoaded({ env: process.env });
    if (loaded) {
      const action = await prompter.select({
        message: t(
          "wizard",
          "finalize.serviceAlreadyInstalled",
          "Gateway service already installed",
        ),
        options: [
          { value: "restart", label: t("wizard", "finalize.serviceRestart", "Restart") },
          { value: "reinstall", label: t("wizard", "finalize.serviceReinstall", "Reinstall") },
          { value: "skip", label: t("wizard", "finalize.serviceSkip", "Skip") },
        ],
      });
      if (action === "restart") {
        await withWizardProgress(
          t("wizard", "finalize.gatewayService", "Gateway service"),
          { doneMessage: t("wizard", "finalize.serviceRestarted", "Gateway service restarted.") },
          async (progress) => {
            progress.update(
              t("wizard", "finalize.restartingService", "Restarting Gateway service…"),
            );
            await service.restart({
              env: process.env,
              stdout: process.stdout,
            });
          },
        );
      } else if (action === "reinstall") {
        await withWizardProgress(
          t("wizard", "finalize.gatewayService", "Gateway service"),
          {
            doneMessage: t("wizard", "finalize.serviceUninstalled", "Gateway service uninstalled."),
          },
          async (progress) => {
            progress.update(
              t("wizard", "finalize.uninstallingService", "Uninstalling Gateway service…"),
            );
            await service.uninstall({ env: process.env, stdout: process.stdout });
          },
        );
      }
    }

    if (!loaded || (loaded && !(await service.isLoaded({ env: process.env })))) {
      const progress = prompter.progress(t("wizard", "finalize.gatewayService", "Gateway service"));
      let installError: string | null = null;
      try {
        progress.update(t("wizard", "finalize.preparingService", "Preparing Gateway service…"));
        const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
          env: process.env,
          port: settings.port,
          token: settings.gatewayToken,
          runtime: daemonRuntime,
          warn: (message, title) => prompter.note(message, title),
          config: nextConfig,
        });

        progress.update(t("wizard", "finalize.installingService", "Installing Gateway service…"));
        await service.install({
          env: process.env,
          stdout: process.stdout,
          programArguments,
          workingDirectory,
          environment,
        });
      } catch (err) {
        installError = err instanceof Error ? err.message : String(err);
      } finally {
        progress.stop(
          installError
            ? t("wizard", "finalize.serviceInstallFailed", "Gateway service install failed.")
            : t("wizard", "finalize.serviceInstalled", "Gateway service installed."),
        );
      }
      if (installError) {
        await prompter.note(
          `${t("wizard", "finalize.serviceInstallFailed", "Gateway service install failed:")}: ${installError}`,
          t("wizard", "finalize.gatewayTitle", "Gateway"),
        );
        await prompter.note(
          gatewayInstallErrorHint(),
          t("wizard", "finalize.gatewayTitle", "Gateway"),
        );
      }
    }
  }

  if (!opts.skipHealth) {
    const probeLinks = resolveControlUiLinks({
      bind: nextConfig.gateway?.bind ?? "loopback",
      port: settings.port,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: undefined,
    });
    // Daemon install/restart can briefly flap the WS; wait a bit so health check doesn't false-fail.
    await waitForGatewayReachable({
      url: probeLinks.wsUrl,
      token: settings.gatewayToken,
      deadlineMs: 15_000,
    });
    try {
      await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
    } catch (err) {
      runtime.error(formatHealthCheckFailure(err));
      await prompter.note(
        [
          "Docs:",
          "https://docs.openclaw.ai/gateway/health",
          "https://docs.openclaw.ai/gateway/troubleshooting",
        ].join("\n"),
        t("wizard", "finalize.healthCheckHelp", "Health check help"),
      );
    }
  }

  const controlUiEnabled =
    nextConfig.gateway?.controlUi?.enabled ?? baseConfig.gateway?.controlUi?.enabled ?? true;
  if (!opts.skipUi && controlUiEnabled) {
    const controlUiAssets = await ensureControlUiAssetsBuilt(runtime);
    if (!controlUiAssets.ok && controlUiAssets.message) {
      runtime.error(controlUiAssets.message);
    }
  }

  await prompter.note(
    [
      t("wizard", "finalize.optionalAppsNote", "Add nodes for extra features:"),
      t("wizard", "finalize.macosApp", "- macOS app (system + notifications)"),
      t("wizard", "finalize.iosApp", "- iOS app (camera/canvas)"),
      t("wizard", "finalize.androidApp", "- Android app (camera/canvas)"),
    ].join("\n"),
    t("wizard", "finalize.optionalApps", "Optional apps"),
  );

  const controlUiBasePath =
    nextConfig.gateway?.controlUi?.basePath ?? baseConfig.gateway?.controlUi?.basePath;
  const links = resolveControlUiLinks({
    bind: settings.bind,
    port: settings.port,
    customBindHost: settings.customBindHost,
    basePath: controlUiBasePath,
  });
  const authedUrl =
    settings.authMode === "token" && settings.gatewayToken
      ? `${links.httpUrl}#token=${encodeURIComponent(settings.gatewayToken)}`
      : links.httpUrl;
  const gatewayProbe = await probeGatewayReachable({
    url: links.wsUrl,
    token: settings.authMode === "token" ? settings.gatewayToken : undefined,
    password: settings.authMode === "password" ? nextConfig.gateway?.auth?.password : "",
  });
  const gatewayStatusLine = gatewayProbe.ok
    ? t("wizard", "finalize.gatewayReachable", "Gateway: reachable")
    : `${t("wizard", "finalize.gatewayNotDetected", "Gateway: not detected")}${gatewayProbe.detail ? ` (${gatewayProbe.detail})` : ""}`;
  const bootstrapPath = path.join(
    resolveUserPath(options.workspaceDir),
    DEFAULT_BOOTSTRAP_FILENAME,
  );
  const hasBootstrap = await fs
    .access(bootstrapPath)
    .then(() => true)
    .catch(() => false);

  await prompter.note(
    [
      `Web UI: ${links.httpUrl}`,
      settings.authMode === "token" && settings.gatewayToken
        ? `Web UI (with token): ${authedUrl}`
        : undefined,
      `Gateway WS: ${links.wsUrl}`,
      gatewayStatusLine,
      "Docs: https://docs.openclaw.ai/web/control-ui",
    ]
      .filter(Boolean)
      .join("\n"),
    t("wizard", "finalize.controlUi", "Control UI"),
  );

  let controlUiOpened = false;
  let controlUiOpenHint: string | undefined;
  let seededInBackground = false;
  let hatchChoice: "tui" | "web" | "later" | null = null;
  let launchedTui = false;

  if (!opts.skipUi && gatewayProbe.ok) {
    if (hasBootstrap) {
      await prompter.note(
        [
          t(
            "wizard",
            "finalize.startTuiNote1",
            "This is the defining action that makes your agent you.",
          ),
          t("wizard", "finalize.startTuiNote2", "Please take your time."),
          t(
            "wizard",
            "finalize.startTuiNote3",
            "The more you tell it, the better the experience will be.",
          ),
          t("wizard", "finalize.startTuiNote4", 'We will send: "Wake up, my friend!"'),
        ].join("\n"),
        t("wizard", "finalize.startTuiTitle", "Start TUI (best option!)"),
      );
    }

    await prompter.note(
      [
        t(
          "wizard",
          "finalize.tokenNote",
          "Gateway token: shared auth for the Gateway + Control UI.",
        ),
        t(
          "wizard",
          "finalize.tokenStored",
          "Stored in: ~/.openclaw/openclaw.json (gateway.auth.token) or OPENCLAW_GATEWAY_TOKEN.",
        ),
        ti(
          "wizard",
          "finalize.tokenView",
          `View token: ${formatCliCommand("openclaw config get gateway.auth.token")}`,
          { cmd: formatCliCommand("openclaw config get gateway.auth.token") },
        ),
        ti(
          "wizard",
          "finalize.tokenGenerate",
          `Generate token: ${formatCliCommand("openclaw doctor --generate-gateway-token")}`,
          { cmd: formatCliCommand("openclaw doctor --generate-gateway-token") },
        ),
        t(
          "wizard",
          "finalize.tokenBrowser",
          "Web UI stores a copy in this browser's localStorage (openclaw.control.settings.v1).",
        ),
        ti(
          "wizard",
          "finalize.tokenDashboard",
          `Open the dashboard anytime: ${formatCliCommand("openclaw dashboard --no-open")}`,
          { cmd: formatCliCommand("openclaw dashboard --no-open") },
        ),
        t(
          "wizard",
          "finalize.tokenPasteHint",
          "If prompted: paste the token into Control UI settings (or use the tokenized dashboard URL).",
        ),
      ].join("\n"),
      t("wizard", "finalize.tokenTitle", "Token"),
    );

    hatchChoice = await prompter.select({
      message: t("wizard", "finalize.hatchQuestion", "How do you want to hatch your bot?"),
      options: [
        { value: "tui", label: t("wizard", "finalize.hatchTui", "Hatch in TUI (recommended)") },
        { value: "web", label: t("wizard", "finalize.hatchWeb", "Open the Web UI") },
        { value: "later", label: t("wizard", "finalize.hatchLater", "Do this later") },
      ],
      initialValue: "tui",
    });

    if (hatchChoice === "tui") {
      restoreTerminalState("pre-onboarding tui");
      await runTui({
        url: links.wsUrl,
        token: settings.authMode === "token" ? settings.gatewayToken : undefined,
        password: settings.authMode === "password" ? nextConfig.gateway?.auth?.password : "",
        // Safety: onboarding TUI should not auto-deliver to lastProvider/lastTo.
        deliver: false,
        message: hasBootstrap ? "Wake up, my friend!" : undefined,
      });
      launchedTui = true;
    } else if (hatchChoice === "web") {
      const browserSupport = await detectBrowserOpenSupport();
      if (browserSupport.ok) {
        controlUiOpened = await openUrl(authedUrl);
        if (!controlUiOpened) {
          controlUiOpenHint = formatControlUiSshHint({
            port: settings.port,
            basePath: controlUiBasePath,
            token: settings.authMode === "token" ? settings.gatewayToken : undefined,
          });
        }
      } else {
        controlUiOpenHint = formatControlUiSshHint({
          port: settings.port,
          basePath: controlUiBasePath,
          token: settings.authMode === "token" ? settings.gatewayToken : undefined,
        });
      }
      await prompter.note(
        [
          ti("wizard", "finalize.dashboardLink", `Dashboard link (with token): ${authedUrl}`, {
            url: authedUrl,
          }),
          controlUiOpened
            ? t(
                "wizard",
                "finalize.dashboardOpened",
                "Opened in your browser. Keep that tab to control OpenClaw.",
              )
            : t(
                "wizard",
                "finalize.dashboardCopyPaste",
                "Copy/paste this URL in a browser on this machine to control OpenClaw.",
              ),
          controlUiOpenHint,
        ]
          .filter(Boolean)
          .join("\n"),
        t("wizard", "finalize.dashboardReady", "Dashboard ready"),
      );
    } else {
      await prompter.note(
        ti(
          "wizard",
          "finalize.laterNote",
          `When you're ready: ${formatCliCommand("openclaw dashboard --no-open")}`,
          { cmd: formatCliCommand("openclaw dashboard --no-open") },
        ),
        t("wizard", "finalize.laterTitle", "Later"),
      );
    }
  } else if (opts.skipUi) {
    await prompter.note(
      t("wizard", "finalize.skipControlUi", "Skipping Control UI/TUI prompts."),
      t("wizard", "finalize.controlUi", "Control UI"),
    );
  }

  await prompter.note(
    [
      t("wizard", "finalize.workspaceBackupNote", "Back up your agent workspace."),
      "Docs: https://docs.openclaw.ai/concepts/agent-workspace",
    ].join("\n"),
    t("wizard", "finalize.workspaceBackup", "Workspace backup"),
  );

  await prompter.note(
    t(
      "wizard",
      "finalize.securityNote",
      "Running agents on your computer is risky — harden your setup: https://docs.openclaw.ai/security",
    ),
    t("wizard", "security.title", "Security"),
  );

  await setupOnboardingShellCompletion({ flow, prompter });

  const shouldOpenControlUi =
    !opts.skipUi &&
    settings.authMode === "token" &&
    Boolean(settings.gatewayToken) &&
    hatchChoice === null;
  if (shouldOpenControlUi) {
    const browserSupport = await detectBrowserOpenSupport();
    if (browserSupport.ok) {
      controlUiOpened = await openUrl(authedUrl);
      if (!controlUiOpened) {
        controlUiOpenHint = formatControlUiSshHint({
          port: settings.port,
          basePath: controlUiBasePath,
          token: settings.gatewayToken,
        });
      }
    } else {
      controlUiOpenHint = formatControlUiSshHint({
        port: settings.port,
        basePath: controlUiBasePath,
        token: settings.gatewayToken,
      });
    }

    await prompter.note(
      [
        ti("wizard", "finalize.dashboardLink", `Dashboard link (with token): ${authedUrl}`, {
          url: authedUrl,
        }),
        controlUiOpened
          ? t(
              "wizard",
              "finalize.dashboardOpened",
              "Opened in your browser. Keep that tab to control OpenClaw.",
            )
          : t(
              "wizard",
              "finalize.dashboardCopyPaste",
              "Copy/paste this URL in a browser on this machine to control OpenClaw.",
            ),
        controlUiOpenHint,
      ]
        .filter(Boolean)
        .join("\n"),
      t("wizard", "finalize.dashboardReady", "Dashboard ready"),
    );
  }

  const webSearchKey = (nextConfig.tools?.web?.search?.apiKey ?? "").trim();
  const webSearchEnv = (process.env.BRAVE_API_KEY ?? "").trim();
  const hasWebSearchKey = Boolean(webSearchKey || webSearchEnv);
  await prompter.note(
    hasWebSearchKey
      ? [
          t(
            "wizard",
            "finalize.webSearchEnabled",
            "Web search is enabled, so your agent can look things up online when needed.",
          ),
          "",
          webSearchKey
            ? t(
                "wizard",
                "finalize.webSearchKeyConfig",
                "API key: stored in config (tools.web.search.apiKey).",
              )
            : t(
                "wizard",
                "finalize.webSearchKeyEnv",
                "API key: provided via BRAVE_API_KEY env var (Gateway environment).",
              ),
          "Docs: https://docs.openclaw.ai/tools/web",
        ].join("\n")
      : [
          t(
            "wizard",
            "finalize.webSearchNeeded",
            "If you want your agent to be able to search the web, you'll need an API key.",
          ),
          "",
          t(
            "wizard",
            "finalize.webSearchBrave",
            "OpenClaw uses Brave Search for the `web_search` tool. Without a Brave Search API key, web search won't work.",
          ),
          "",
          t("wizard", "finalize.webSearchSetup", "Set it up interactively:"),
          ti(
            "wizard",
            "finalize.webSearchRunCmd",
            `- Run: ${formatCliCommand("openclaw configure --section web")}`,
            { cmd: formatCliCommand("openclaw configure --section web") },
          ),
          t(
            "wizard",
            "finalize.webSearchEnableHint",
            "- Enable web_search and paste your Brave Search API key",
          ),
          "",
          t(
            "wizard",
            "finalize.webSearchAlt",
            "Alternative: set BRAVE_API_KEY in the Gateway environment (no config changes).",
          ),
          "Docs: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
    t("wizard", "finalize.webSearchTitle", "Web search (optional)"),
  );

  await prompter.note(
    t(
      "wizard",
      "finalize.whatNowNote",
      'What now: https://openclaw.ai/showcase ("What People Are Building").',
    ),
    t("wizard", "finalize.whatNow", "What now"),
  );

  await prompter.outro(
    controlUiOpened
      ? t(
          "wizard",
          "finalize.outroWithDashboard",
          "Onboarding complete. Dashboard opened; keep that tab to control OpenClaw.",
        )
      : seededInBackground
        ? t(
            "wizard",
            "finalize.outroWithBackground",
            "Onboarding complete. Web UI seeded in the background; open it anytime with the dashboard link above.",
          )
        : t(
            "wizard",
            "finalize.outroDefault",
            "Onboarding complete. Use the dashboard link above to control OpenClaw.",
          ),
  );

  return { launchedTui };
}
