import fsPromises from "node:fs/promises";
import nodePath from "node:path";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import { readConfigFileSnapshot, resolveGatewayPort, writeConfigFile } from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import { normalizeSecretInputString } from "../config/types.secrets.js";
import { tcfg, ti, tw } from "../i18n/index.js";
import { ensureControlUiAssetsBuilt } from "../infra/control-ui-assets.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { note } from "../terminal/note.js";
import { resolveUserPath } from "../utils.js";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { WizardCancelledError } from "../wizard/prompts.js";
import { removeChannelConfigWizard } from "./configure.channels.js";
import { maybeInstallDaemon } from "./configure.daemon.js";
import { promptAuthConfig } from "./configure.gateway-auth.js";
import { promptGatewayConfig } from "./configure.gateway.js";
import type {
  ChannelsWizardMode,
  ConfigureWizardParams,
  WizardSection,
} from "./configure.shared.js";
import {
  CONFIGURE_SECTION_OPTIONS,
  confirm,
  intro,
  outro,
  select,
  text,
} from "./configure.shared.js";
import { formatHealthCheckFailure } from "./health-format.js";
import { healthCommand } from "./health.js";
import { noteChannelStatus, setupChannels } from "./onboard-channels.js";
import {
  applyWizardMetadata,
  DEFAULT_WORKSPACE,
  ensureWorkspaceAndSessions,
  guardCancel,
  printWizardHeader,
  probeGatewayReachable,
  resolveControlUiLinks,
  summarizeExistingConfig,
  waitForGatewayReachable,
} from "./onboard-helpers.js";
import { promptRemoteGatewayConfig } from "./onboard-remote.js";
import { setupSkills } from "./onboard-skills.js";

type ConfigureSectionChoice = WizardSection | "__continue";

async function runGatewayHealthCheck(params: {
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  port: number;
}): Promise<void> {
  const localLinks = resolveControlUiLinks({
    bind: params.cfg.gateway?.bind ?? "loopback",
    port: params.port,
    customBindHost: params.cfg.gateway?.customBindHost,
    basePath: undefined,
  });
  const remoteUrl = params.cfg.gateway?.remote?.url?.trim();
  const wsUrl = params.cfg.gateway?.mode === "remote" && remoteUrl ? remoteUrl : localLinks.wsUrl;
  const token = params.cfg.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN;
  const password =
    normalizeSecretInputString(params.cfg.gateway?.auth?.password) ??
    process.env.OPENCLAW_GATEWAY_PASSWORD;

  await waitForGatewayReachable({
    url: wsUrl,
    token,
    password,
    deadlineMs: 15_000,
  });

  try {
    await healthCommand({ json: false, timeoutMs: 10_000 }, params.runtime);
  } catch (err) {
    params.runtime.error(formatHealthCheckFailure(err));
    note(
      [
        "Docs:",
        "https://docs.openclaw.ai/gateway/health",
        "https://docs.openclaw.ai/gateway/troubleshooting",
      ].join("\n"),
      tcfg("wizard.healthCheckHelp", "Health check help"),
    );
  }
}

async function promptConfigureSection(
  runtime: RuntimeEnv,
  hasSelection: boolean,
): Promise<ConfigureSectionChoice> {
  return guardCancel(
    await select<ConfigureSectionChoice>({
      message: tcfg("wizard.selectSections", "Select sections to configure"),
      options: [
        ...CONFIGURE_SECTION_OPTIONS,
        {
          value: "__continue",
          label: tcfg("wizard.continue", "Continue"),
          hint: hasSelection
            ? tcfg("wizard.done", "Done")
            : tcfg("wizard.skipForNow", "Skip for now"),
        },
      ],
      initialValue: CONFIGURE_SECTION_OPTIONS[0]?.value,
    }),
    runtime,
  );
}

async function promptChannelMode(runtime: RuntimeEnv): Promise<ChannelsWizardMode> {
  return guardCancel(
    await select({
      message: tw("channels.title", "Channels"),
      options: [
        {
          value: "configure",
          label: tcfg("wizard.channelsConfigureLink", "Configure/link"),
          hint: tcfg(
            "wizard.channelsConfigureLinkHint",
            "Add/update channels; disable unselected accounts",
          ),
        },
        {
          value: "remove",
          label: tcfg("wizard.channelsRemove", "Remove channel config"),
          hint: tcfg(
            "wizard.channelsRemoveHint",
            "Delete channel tokens/settings from openclaw.json",
          ),
        },
      ],
      initialValue: "configure",
    }),
    runtime,
  ) as ChannelsWizardMode;
}

async function promptWebToolsConfig(
  nextConfig: OpenClawConfig,
  runtime: RuntimeEnv,
): Promise<OpenClawConfig> {
  const existingSearch = nextConfig.tools?.web?.search;
  const existingFetch = nextConfig.tools?.web?.fetch;
  const hasSearchKey = Boolean(existingSearch?.apiKey);

  note(
    [
      tcfg(
        "wizard.webSearchNote1",
        "Web search lets your agent look things up online using the `web_search` tool.",
      ),
      tcfg(
        "wizard.webSearchNote2",
        "It requires a Brave Search API key (you can store it in the config or set BRAVE_API_KEY in the Gateway environment).",
      ),
      "Docs: https://docs.openclaw.ai/tools/web",
    ].join("\n"),
    tcfg("wizard.webSearchTitle", "Web search"),
  );

  const enableSearch = guardCancel(
    await confirm({
      message: tcfg("wizard.enableWebSearch", "Enable web_search (Brave Search)?"),
      initialValue: existingSearch?.enabled ?? hasSearchKey,
    }),
    runtime,
  );

  let nextSearch = {
    ...existingSearch,
    enabled: enableSearch,
  };

  if (enableSearch) {
    const keyInput = guardCancel(
      await text({
        message: hasSearchKey
          ? tcfg(
              "wizard.braveKeyExisting",
              "Brave Search API key (leave blank to keep current or use BRAVE_API_KEY)",
            )
          : tcfg(
              "wizard.braveKeyNew",
              "Brave Search API key (paste it here; leave blank to use BRAVE_API_KEY)",
            ),
        placeholder: hasSearchKey
          ? tcfg("wizard.braveKeyPlaceholder", "Leave blank to keep current")
          : "BSA...",
      }),
      runtime,
    );
    const key = String(keyInput ?? "").trim();
    if (key) {
      nextSearch = { ...nextSearch, apiKey: key };
    } else if (!hasSearchKey) {
      note(
        [
          tcfg("wizard.noKeyStored1", "No key stored yet, so web_search will stay unavailable."),
          tcfg(
            "wizard.noKeyStored2",
            "Store a key here or set BRAVE_API_KEY in the Gateway environment.",
          ),
          "Docs: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        tcfg("wizard.webSearchTitle", "Web search"),
      );
    }
  }

  const enableFetch = guardCancel(
    await confirm({
      message: tcfg("wizard.enableWebFetch", "Enable web_fetch (keyless HTTP fetch)?"),
      initialValue: existingFetch?.enabled ?? true,
    }),
    runtime,
  );

  const nextFetch = {
    ...existingFetch,
    enabled: enableFetch,
  };

  return {
    ...nextConfig,
    tools: {
      ...nextConfig.tools,
      web: {
        ...nextConfig.tools?.web,
        search: nextSearch,
        fetch: nextFetch,
      },
    },
  };
}

export async function runConfigureWizard(
  opts: ConfigureWizardParams,
  runtime: RuntimeEnv = defaultRuntime,
) {
  try {
    printWizardHeader(runtime);
    intro(
      opts.command === "update"
        ? tcfg("wizard.updateTitle", "OpenClaw update wizard")
        : tcfg("wizard.configureTitle", "OpenClaw configure"),
    );
    const prompter = createClackPrompter();

    const snapshot = await readConfigFileSnapshot();
    const baseConfig: OpenClawConfig = snapshot.valid ? snapshot.config : {};

    if (snapshot.exists) {
      const title = snapshot.valid
        ? tw("config.existing", "Existing config detected")
        : tw("config.invalid", "Invalid config");
      note(summarizeExistingConfig(baseConfig), title);
      if (!snapshot.valid && snapshot.issues.length > 0) {
        note(
          [
            ...snapshot.issues.map((iss) => `- ${iss.path}: ${iss.message}`),
            "",
            "Docs: https://docs.openclaw.ai/gateway/configuration",
          ].join("\n"),
          tw("config.issues", "Config issues"),
        );
      }
      if (!snapshot.valid) {
        outro(
          ti(
            "configure",
            "config.invalidRun",
            "Config invalid. Run `{cmd}` to repair it, then re-run configure.",
            { cmd: formatCliCommand("openclaw doctor") },
          ),
        );
        runtime.exit(1);
        return;
      }
    }

    const localUrl = "ws://127.0.0.1:18789";
    const localProbe = await probeGatewayReachable({
      url: localUrl,
      token: baseConfig.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN,
      password:
        normalizeSecretInputString(baseConfig.gateway?.auth?.password) ??
        process.env.OPENCLAW_GATEWAY_PASSWORD,
    });
    const remoteUrl = baseConfig.gateway?.remote?.url?.trim() ?? "";
    const remoteProbe = remoteUrl
      ? await probeGatewayReachable({
          url: remoteUrl,
          token: normalizeSecretInputString(baseConfig.gateway?.remote?.token),
        })
      : null;

    const mode = guardCancel(
      await select({
        message: tcfg("wizard.whereGateway", "Where will the Gateway run?"),
        options: [
          {
            value: "local",
            label: tcfg("wizard.localMachine", "Local (this machine)"),
            hint: localProbe.ok
              ? ti("configure", "wizard.probeLocalReachable", "Gateway reachable ({url})", {
                  url: localUrl,
                })
              : ti("configure", "wizard.probeLocalNotDetected", "No gateway detected ({url})", {
                  url: localUrl,
                }),
          },
          {
            value: "remote",
            label: tcfg("wizard.remoteMachine", "Remote (info-only)"),
            hint: !remoteUrl
              ? tw("setup.remoteNotConfigured", "No remote URL configured yet")
              : remoteProbe?.ok
                ? ti("configure", "wizard.probeRemoteReachable", "Gateway reachable ({url})", {
                    url: remoteUrl,
                  })
                : ti(
                    "configure",
                    "wizard.probeRemoteUnreachable",
                    "Configured but unreachable ({url})",
                    { url: remoteUrl },
                  ),
          },
        ],
      }),
      runtime,
    );

    if (mode === "remote") {
      let remoteConfig = await promptRemoteGatewayConfig(baseConfig, prompter);
      remoteConfig = applyWizardMetadata(remoteConfig, {
        command: opts.command,
        mode,
      });
      await writeConfigFile(remoteConfig);
      logConfigUpdated(runtime);
      outro(tcfg("wizard.remoteConfigured", "Remote gateway configured."));
      return;
    }

    let nextConfig = { ...baseConfig };
    let didSetGatewayMode = false;
    if (nextConfig.gateway?.mode !== "local") {
      nextConfig = {
        ...nextConfig,
        gateway: {
          ...nextConfig.gateway,
          mode: "local",
        },
      };
      didSetGatewayMode = true;
    }
    let workspaceDir =
      nextConfig.agents?.defaults?.workspace ??
      baseConfig.agents?.defaults?.workspace ??
      DEFAULT_WORKSPACE;
    let gatewayPort = resolveGatewayPort(baseConfig);
    let gatewayToken: string | undefined =
      normalizeSecretInputString(nextConfig.gateway?.auth?.token) ??
      normalizeSecretInputString(baseConfig.gateway?.auth?.token) ??
      process.env.OPENCLAW_GATEWAY_TOKEN;

    const persistConfig = async () => {
      nextConfig = applyWizardMetadata(nextConfig, {
        command: opts.command,
        mode,
      });
      await writeConfigFile(nextConfig);
      logConfigUpdated(runtime);
    };

    const configureWorkspace = async () => {
      const workspaceInput = guardCancel(
        await text({
          message: tw("workspace.title", "Workspace directory"),
          initialValue: workspaceDir,
        }),
        runtime,
      );
      workspaceDir = resolveUserPath(String(workspaceInput ?? "").trim() || DEFAULT_WORKSPACE);
      if (!snapshot.exists) {
        const indicators = ["MEMORY.md", "memory", ".git"].map((name) =>
          nodePath.join(workspaceDir, name),
        );
        const hasExistingContent = (
          await Promise.all(
            indicators.map(async (candidate) => {
              try {
                await fsPromises.access(candidate);
                return true;
              } catch {
                return false;
              }
            }),
          )
        ).some(Boolean);
        if (hasExistingContent) {
          note(
            [
              ti("configure", "wizard.workspaceDetected", "Existing workspace detected at {dir}", {
                dir: workspaceDir,
              }),
              tcfg(
                "wizard.workspacePreserved",
                "Existing files are preserved. Missing templates may be created, never overwritten.",
              ),
            ].join("\n"),
            tcfg("wizard.existingWorkspaceTitle", "Existing workspace"),
          );
        }
      }
      nextConfig = {
        ...nextConfig,
        agents: {
          ...nextConfig.agents,
          defaults: {
            ...nextConfig.agents?.defaults,
            workspace: workspaceDir,
          },
        },
      };
      await ensureWorkspaceAndSessions(workspaceDir, runtime);
    };

    const configureChannelsSection = async () => {
      await noteChannelStatus({ cfg: nextConfig, prompter });
      const channelMode = await promptChannelMode(runtime);
      if (channelMode === "configure") {
        nextConfig = await setupChannels(nextConfig, runtime, prompter, {
          allowDisable: true,
          allowSignalInstall: true,
          skipConfirm: true,
          skipStatusNote: true,
        });
      } else {
        nextConfig = await removeChannelConfigWizard(nextConfig, runtime);
      }
    };

    const promptDaemonPort = async () => {
      const portInput = guardCancel(
        await text({
          message: tcfg("wizard.daemonPort", "Gateway port for service install"),
          initialValue: String(gatewayPort),
          validate: (value) =>
            Number.isFinite(Number(value))
              ? undefined
              : tcfg("gateway.invalidPort", "Invalid port"),
        }),
        runtime,
      );
      gatewayPort = Number.parseInt(String(portInput), 10);
    };

    if (opts.sections) {
      const selected = opts.sections;
      if (!selected || selected.length === 0) {
        outro(tcfg("wizard.noChanges", "No changes selected."));
        return;
      }

      if (selected.includes("workspace")) {
        await configureWorkspace();
      }

      if (selected.includes("model")) {
        nextConfig = await promptAuthConfig(nextConfig, runtime, prompter);
      }

      if (selected.includes("web")) {
        nextConfig = await promptWebToolsConfig(nextConfig, runtime);
      }

      if (selected.includes("gateway")) {
        const gateway = await promptGatewayConfig(nextConfig, runtime);
        nextConfig = gateway.config;
        gatewayPort = gateway.port;
        gatewayToken = gateway.token;
      }

      if (selected.includes("channels")) {
        await configureChannelsSection();
      }

      if (selected.includes("skills")) {
        const wsDir = resolveUserPath(workspaceDir);
        nextConfig = await setupSkills(nextConfig, wsDir, runtime, prompter);
      }

      await persistConfig();

      if (selected.includes("daemon")) {
        if (!selected.includes("gateway")) {
          await promptDaemonPort();
        }

        await maybeInstallDaemon({ runtime, port: gatewayPort, gatewayToken });
      }

      if (selected.includes("health")) {
        await runGatewayHealthCheck({ cfg: nextConfig, runtime, port: gatewayPort });
      }
    } else {
      let ranSection = false;
      let didConfigureGateway = false;

      while (true) {
        const choice = await promptConfigureSection(runtime, ranSection);
        if (choice === "__continue") {
          break;
        }
        ranSection = true;

        if (choice === "workspace") {
          await configureWorkspace();
          await persistConfig();
        }

        if (choice === "model") {
          nextConfig = await promptAuthConfig(nextConfig, runtime, prompter);
          await persistConfig();
        }

        if (choice === "web") {
          nextConfig = await promptWebToolsConfig(nextConfig, runtime);
          await persistConfig();
        }

        if (choice === "gateway") {
          const gateway = await promptGatewayConfig(nextConfig, runtime);
          nextConfig = gateway.config;
          gatewayPort = gateway.port;
          gatewayToken = gateway.token;
          didConfigureGateway = true;
          await persistConfig();
        }

        if (choice === "channels") {
          await configureChannelsSection();
          await persistConfig();
        }

        if (choice === "skills") {
          const wsDir = resolveUserPath(workspaceDir);
          nextConfig = await setupSkills(nextConfig, wsDir, runtime, prompter);
          await persistConfig();
        }

        if (choice === "daemon") {
          if (!didConfigureGateway) {
            await promptDaemonPort();
          }
          await maybeInstallDaemon({
            runtime,
            port: gatewayPort,
            gatewayToken,
          });
        }

        if (choice === "health") {
          await runGatewayHealthCheck({ cfg: nextConfig, runtime, port: gatewayPort });
        }
      }

      if (!ranSection) {
        if (didSetGatewayMode) {
          await persistConfig();
          outro(tcfg("wizard.gatewayLocal", "Gateway mode set to local."));
          return;
        }
        outro(tcfg("wizard.noChanges", "No changes selected."));
        return;
      }
    }

    const controlUiAssets = await ensureControlUiAssetsBuilt(runtime);
    if (!controlUiAssets.ok && controlUiAssets.message) {
      runtime.error(controlUiAssets.message);
    }

    const bind = nextConfig.gateway?.bind ?? "loopback";
    const links = resolveControlUiLinks({
      bind,
      port: gatewayPort,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: nextConfig.gateway?.controlUi?.basePath,
    });
    // Try both new and old passwords since gateway may still have old config.
    const newPassword =
      normalizeSecretInputString(nextConfig.gateway?.auth?.password) ??
      process.env.OPENCLAW_GATEWAY_PASSWORD;
    const oldPassword =
      normalizeSecretInputString(baseConfig.gateway?.auth?.password) ??
      process.env.OPENCLAW_GATEWAY_PASSWORD;
    const token = nextConfig.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN;

    let gatewayProbe = await probeGatewayReachable({
      url: links.wsUrl,
      token,
      password: newPassword,
    });
    // If new password failed and it's different from old password, try old too.
    if (!gatewayProbe.ok && newPassword !== oldPassword && oldPassword) {
      gatewayProbe = await probeGatewayReachable({
        url: links.wsUrl,
        token,
        password: oldPassword,
      });
    }
    const gatewayStatusLine = gatewayProbe.ok
      ? tcfg("wizard.gatewayReachable", "Gateway: reachable")
      : gatewayProbe.detail
        ? ti("configure", "wizard.gatewayNotDetectedDetail", "Gateway: not detected ({detail})", {
            detail: gatewayProbe.detail,
          })
        : tcfg("wizard.gatewayNotDetected", "Gateway: not detected");

    note(
      [
        ti("configure", "wizard.webUiLabel", "Web UI: {url}", { url: links.httpUrl }),
        ti("configure", "wizard.gatewayWsLabel", "Gateway WS: {url}", { url: links.wsUrl }),
        gatewayStatusLine,
        "Docs: https://docs.openclaw.ai/web/control-ui",
      ].join("\n"),
      tcfg("wizard.controlUiTitle", "Control UI"),
    );

    outro(tcfg("wizard.complete", "Configure complete."));
  } catch (err) {
    if (err instanceof WizardCancelledError) {
      runtime.exit(1);
      return;
    }
    throw err;
  }
}
