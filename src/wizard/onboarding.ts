import type {
  GatewayAuthChoice,
  OnboardMode,
  OnboardOptions,
  ResetScope,
} from "../commands/onboard-types.js";
import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { QuickstartGatewayDefaults, WizardFlow } from "./onboarding.types.js";
import { ensureAuthProfileStore } from "../agents/auth-profiles.js";
import { listChannelPlugins } from "../channels/plugins/index.js";
import { formatCliCommand } from "../cli/command-format.js";
import { promptAuthChoiceGrouped } from "../commands/auth-choice-prompt.js";
import {
  applyAuthChoice,
  resolvePreferredProviderForAuthChoice,
  warnIfModelConfigLooksOff,
} from "../commands/auth-choice.js";
import { applyPrimaryModel, promptDefaultModel } from "../commands/model-picker.js";
import { setupChannels } from "../commands/onboard-channels.js";
import { promptCustomApiConfig } from "../commands/onboard-custom.js";
import {
  applyWizardMetadata,
  DEFAULT_WORKSPACE,
  ensureWorkspaceAndSessions,
  handleReset,
  printWizardHeader,
  probeGatewayReachable,
  summarizeExistingConfig,
} from "../commands/onboard-helpers.js";
import { setupInternalHooks } from "../commands/onboard-hooks.js";
import { promptRemoteGatewayConfig } from "../commands/onboard-remote.js";
import { setupSkills } from "../commands/onboard-skills.js";
import {
  DEFAULT_GATEWAY_PORT,
  readConfigFileSnapshot,
  resolveGatewayPort,
  writeConfigFile,
} from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import { t } from "../i18n/index.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath } from "../utils.js";
import { finalizeOnboardingWizard } from "./onboarding.finalize.js";
import { configureGatewayForOnboarding } from "./onboarding.gateway-config.js";
import { WizardCancelledError, type WizardPrompter } from "./prompts.js";

async function requireRiskAcknowledgement(params: {
  opts: OnboardOptions;
  prompter: WizardPrompter;
}) {
  if (params.opts.acceptRisk === true) {
    return;
  }

  await params.prompter.note(
    [
      t("wizard", "security.warning", "Security warning — please read."),
      "",
      t(
        "wizard",
        "security.beta",
        "OpenClaw is a hobby project and still in beta. Expect sharp edges.",
      ),
      t(
        "wizard",
        "security.readFiles",
        "This bot can read files and run actions if tools are enabled.",
      ),
      t("wizard", "security.badPrompt", "A bad prompt can trick it into doing unsafe things."),
      "",
      t(
        "wizard",
        "security.notComfortable",
        "If you're not comfortable with basic security and access control, don't run OpenClaw.",
      ),
      t(
        "wizard",
        "security.askHelp",
        "Ask someone experienced to help before enabling tools or exposing it to the internet.",
      ),
      "",
      t("wizard", "security.baseline", "Recommended baseline:"),
      t("wizard", "security.pairing", "- Pairing/allowlists + mention gating."),
      t("wizard", "security.sandbox", "- Sandbox + least-privilege tools."),
      t("wizard", "security.secrets", "- Keep secrets out of the agent's reachable filesystem."),
      t(
        "wizard",
        "security.strongModel",
        "- Use the strongest available model for any bot with tools or untrusted inboxes.",
      ),
      "",
      t("wizard", "security.runRegularly", "Run regularly:"),
      "openclaw security audit --deep",
      "openclaw security audit --fix",
      "",
      t("wizard", "security.mustRead", "Must read:") + " https://docs.openclaw.ai/gateway/security",
    ].join("\n"),
    t("wizard", "security.title", "Security"),
  );

  const ok = await params.prompter.confirm({
    message: t(
      "wizard",
      "security.confirm",
      "I understand this is powerful and inherently risky. Continue?",
    ),
    initialValue: false,
  });
  if (!ok) {
    throw new WizardCancelledError("risk not accepted");
  }
}

export async function runOnboardingWizard(
  opts: OnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
  prompter: WizardPrompter,
) {
  printWizardHeader(runtime);
  await prompter.intro(t("wizard", "intro", "OpenClaw onboarding"));
  await requireRiskAcknowledgement({ opts, prompter });

  const snapshot = await readConfigFileSnapshot();
  let baseConfig: OpenClawConfig = snapshot.valid ? snapshot.config : {};

  if (snapshot.exists && !snapshot.valid) {
    await prompter.note(
      summarizeExistingConfig(baseConfig),
      t("wizard", "config.invalid", "Invalid config"),
    );
    if (snapshot.issues.length > 0) {
      await prompter.note(
        [
          ...snapshot.issues.map((iss) => `- ${iss.path}: ${iss.message}`),
          "",
          "Docs: https://docs.openclaw.ai/gateway/configuration",
        ].join("\n"),
        t("wizard", "config.issues", "Config issues"),
      );
    }
    await prompter.outro(
      t(
        "wizard",
        "config.invalidRun",
        `Config invalid. Run \`${formatCliCommand("openclaw doctor")}\` to repair it, then re-run onboarding.`,
      ),
    );
    runtime.exit(1);
    return;
  }

  const quickstartHint = t(
    "wizard",
    "mode.quickstartHint",
    `Configure details later via ${formatCliCommand("openclaw configure")}.`,
  );
  const manualHint = t(
    "wizard",
    "mode.manualHint",
    "Configure port, network, Tailscale, and auth options.",
  );
  const explicitFlowRaw = opts.flow?.trim();
  const normalizedExplicitFlow = explicitFlowRaw === "manual" ? "advanced" : explicitFlowRaw;
  if (
    normalizedExplicitFlow &&
    normalizedExplicitFlow !== "quickstart" &&
    normalizedExplicitFlow !== "advanced"
  ) {
    runtime.error("Invalid --flow (use quickstart, manual, or advanced).");
    runtime.exit(1);
    return;
  }
  const explicitFlow: WizardFlow | undefined =
    normalizedExplicitFlow === "quickstart" || normalizedExplicitFlow === "advanced"
      ? normalizedExplicitFlow
      : undefined;
  let flow: WizardFlow =
    explicitFlow ??
    (await prompter.select({
      message: t("wizard", "mode.title", "Onboarding mode"),
      options: [
        {
          value: "quickstart",
          label: t("wizard", "mode.quickstart", "QuickStart"),
          hint: quickstartHint,
        },
        { value: "advanced", label: t("wizard", "mode.manual", "Manual"), hint: manualHint },
      ],
      initialValue: "quickstart",
    }));

  if (opts.mode === "remote" && flow === "quickstart") {
    await prompter.note(
      t(
        "wizard",
        "mode.quickstartLocalOnly",
        "QuickStart only supports local gateways. Switching to Manual mode.",
      ),
      "QuickStart",
    );
    flow = "advanced";
  }

  if (snapshot.exists) {
    await prompter.note(
      summarizeExistingConfig(baseConfig),
      t("wizard", "config.existing", "Existing config detected"),
    );

    const action = await prompter.select({
      message: t("wizard", "config.handling", "Config handling"),
      options: [
        { value: "keep", label: t("wizard", "config.keep", "Use existing values") },
        { value: "modify", label: t("wizard", "config.modify", "Update values") },
        { value: "reset", label: t("wizard", "config.reset", "Reset") },
      ],
    });

    if (action === "reset") {
      const workspaceDefault = baseConfig.agents?.defaults?.workspace ?? DEFAULT_WORKSPACE;
      const resetScope = (await prompter.select({
        message: t("wizard", "reset.scope", "Reset scope"),
        options: [
          { value: "config", label: t("wizard", "reset.configOnly", "Config only") },
          {
            value: "config+creds+sessions",
            label: t("wizard", "reset.configCredsSessions", "Config + creds + sessions"),
          },
          {
            value: "full",
            label: t("wizard", "reset.full", "Full reset (config + creds + sessions + workspace)"),
          },
        ],
      })) as ResetScope;
      await handleReset(resetScope, resolveUserPath(workspaceDefault), runtime);
      baseConfig = {};
    }
  }

  const quickstartGateway: QuickstartGatewayDefaults = (() => {
    const hasExisting =
      typeof baseConfig.gateway?.port === "number" ||
      baseConfig.gateway?.bind !== undefined ||
      baseConfig.gateway?.auth?.mode !== undefined ||
      baseConfig.gateway?.auth?.token !== undefined ||
      baseConfig.gateway?.auth?.password !== undefined ||
      baseConfig.gateway?.customBindHost !== undefined ||
      baseConfig.gateway?.tailscale?.mode !== undefined;

    const bindRaw = baseConfig.gateway?.bind;
    const bind =
      bindRaw === "loopback" ||
      bindRaw === "lan" ||
      bindRaw === "auto" ||
      bindRaw === "custom" ||
      bindRaw === "tailnet"
        ? bindRaw
        : "loopback";

    let authMode: GatewayAuthChoice = "token";
    if (
      baseConfig.gateway?.auth?.mode === "token" ||
      baseConfig.gateway?.auth?.mode === "password"
    ) {
      authMode = baseConfig.gateway.auth.mode;
    } else if (baseConfig.gateway?.auth?.token) {
      authMode = "token";
    } else if (baseConfig.gateway?.auth?.password) {
      authMode = "password";
    }

    const tailscaleRaw = baseConfig.gateway?.tailscale?.mode;
    const tailscaleMode =
      tailscaleRaw === "off" || tailscaleRaw === "serve" || tailscaleRaw === "funnel"
        ? tailscaleRaw
        : "off";

    return {
      hasExisting,
      port: resolveGatewayPort(baseConfig),
      bind,
      authMode,
      tailscaleMode,
      token: baseConfig.gateway?.auth?.token,
      password: baseConfig.gateway?.auth?.password,
      customBindHost: baseConfig.gateway?.customBindHost,
      tailscaleResetOnExit: baseConfig.gateway?.tailscale?.resetOnExit ?? false,
    };
  })();

  if (flow === "quickstart") {
    const formatBind = (value: "loopback" | "lan" | "auto" | "custom" | "tailnet") => {
      if (value === "loopback") {
        return t("wizard", "gateway.bindLoopback", "Loopback (127.0.0.1)");
      }
      if (value === "lan") {
        return t("wizard", "gateway.bindLan", "LAN");
      }
      if (value === "custom") {
        return t("wizard", "gateway.bindCustom", "Custom IP");
      }
      if (value === "tailnet") {
        return t("wizard", "gateway.bindTailnet", "Tailnet (Tailscale IP)");
      }
      return t("wizard", "gateway.bindAuto", "Auto");
    };
    const formatAuth = (value: GatewayAuthChoice) => {
      if (value === "token") {
        return t("wizard", "gateway.authToken", "Token (default)");
      }
      return t("wizard", "gateway.authPassword", "Password");
    };
    const formatTailscale = (value: "off" | "serve" | "funnel") => {
      if (value === "off") {
        return t("wizard", "gateway.tailscaleOff", "Off");
      }
      if (value === "serve") {
        return t("wizard", "gateway.tailscaleServe", "Serve");
      }
      return t("wizard", "gateway.tailscaleFunnel", "Funnel");
    };
    const quickstartLines = quickstartGateway.hasExisting
      ? [
          t("wizard", "gateway.keepSettings", "Keeping your current gateway settings:"),
          `${t("wizard", "gateway.port", "Gateway port")}: ${quickstartGateway.port}`,
          `${t("wizard", "gateway.bind", "Gateway bind")}: ${formatBind(quickstartGateway.bind)}`,
          ...(quickstartGateway.bind === "custom" && quickstartGateway.customBindHost
            ? [
                `${t("wizard", "gateway.customIp", "Gateway custom IP")}: ${quickstartGateway.customBindHost}`,
              ]
            : []),
          `${t("wizard", "gateway.auth", "Gateway auth")}: ${formatAuth(quickstartGateway.authMode)}`,
          `${t("wizard", "gateway.tailscale", "Tailscale exposure")}: ${formatTailscale(quickstartGateway.tailscaleMode)}`,
          t("wizard", "gateway.directToChannels", "Direct to chat channels."),
        ]
      : [
          `${t("wizard", "gateway.port", "Gateway port")}: ${DEFAULT_GATEWAY_PORT}`,
          `${t("wizard", "gateway.bind", "Gateway bind")}: ${t("wizard", "gateway.bindLoopback", "Loopback (127.0.0.1)")}`,
          `${t("wizard", "gateway.auth", "Gateway auth")}: ${t("wizard", "gateway.authToken", "Token (default)")}`,
          `${t("wizard", "gateway.tailscale", "Tailscale exposure")}: ${t("wizard", "gateway.tailscaleOff", "Off")}`,
          t("wizard", "gateway.directToChannels", "Direct to chat channels."),
        ];
    await prompter.note(quickstartLines.join("\n"), "QuickStart");
  }

  const localPort = resolveGatewayPort(baseConfig);
  const localUrl = `ws://127.0.0.1:${localPort}`;
  const localProbe = await probeGatewayReachable({
    url: localUrl,
    token: baseConfig.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN,
    password: baseConfig.gateway?.auth?.password ?? process.env.OPENCLAW_GATEWAY_PASSWORD,
  });
  const remoteUrl = baseConfig.gateway?.remote?.url?.trim() ?? "";
  const remoteProbe = remoteUrl
    ? await probeGatewayReachable({
        url: remoteUrl,
        token: baseConfig.gateway?.remote?.token,
      })
    : null;

  const mode =
    opts.mode ??
    (flow === "quickstart"
      ? "local"
      : ((await prompter.select({
          message: t("wizard", "setup.title", "What do you want to set up?"),
          options: [
            {
              value: "local",
              label: t("wizard", "setup.local", "Local gateway (this machine)"),
              hint: localProbe.ok
                ? t("wizard", "setup.localReachable", "Gateway reachable") + ` (${localUrl})`
                : t("wizard", "setup.localNotDetected", "No gateway detected") + ` (${localUrl})`,
            },
            {
              value: "remote",
              label: t("wizard", "setup.remote", "Remote gateway (info-only)"),
              hint: !remoteUrl
                ? t("wizard", "setup.remoteNotConfigured", "No remote URL configured yet")
                : remoteProbe?.ok
                  ? t("wizard", "setup.remoteReachable", "Gateway reachable") + ` (${remoteUrl})`
                  : t("wizard", "setup.remoteUnreachable", "Configured but unreachable") +
                    ` (${remoteUrl})`,
            },
          ],
        })) as OnboardMode));

  if (mode === "remote") {
    let nextConfig = await promptRemoteGatewayConfig(baseConfig, prompter);
    nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
    await writeConfigFile(nextConfig);
    logConfigUpdated(runtime);
    await prompter.outro(t("wizard", "setup.remoteConfigured", "Remote gateway configured."));
    return;
  }

  const workspaceInput =
    opts.workspace ??
    (flow === "quickstart"
      ? (baseConfig.agents?.defaults?.workspace ?? DEFAULT_WORKSPACE)
      : await prompter.text({
          message: t("wizard", "workspace.title", "Workspace directory"),
          initialValue: baseConfig.agents?.defaults?.workspace ?? DEFAULT_WORKSPACE,
        }));

  const workspaceDir = resolveUserPath(workspaceInput.trim() || DEFAULT_WORKSPACE);

  let nextConfig: OpenClawConfig = {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        workspace: workspaceDir,
      },
    },
    gateway: {
      ...baseConfig.gateway,
      mode: "local",
    },
  };

  const authStore = ensureAuthProfileStore(undefined, {
    allowKeychainPrompt: false,
  });
  const authChoiceFromPrompt = opts.authChoice === undefined;
  const authChoice =
    opts.authChoice ??
    (await promptAuthChoiceGrouped({
      prompter,
      store: authStore,
      includeSkip: true,
    }));

  let customPreferredProvider: string | undefined;
  if (authChoice === "custom-api-key") {
    const customResult = await promptCustomApiConfig({
      prompter,
      runtime,
      config: nextConfig,
    });
    nextConfig = customResult.config;
    customPreferredProvider = customResult.providerId;
  } else {
    const authResult = await applyAuthChoice({
      authChoice,
      config: nextConfig,
      prompter,
      runtime,
      setDefaultModel: true,
      opts: {
        tokenProvider: opts.tokenProvider,
        token: opts.authChoice === "apiKey" && opts.token ? opts.token : undefined,
      },
    });
    nextConfig = authResult.config;
  }

  if (authChoiceFromPrompt && authChoice !== "custom-api-key") {
    const modelSelection = await promptDefaultModel({
      config: nextConfig,
      prompter,
      allowKeep: true,
      ignoreAllowlist: true,
      preferredProvider:
        customPreferredProvider ?? resolvePreferredProviderForAuthChoice(authChoice),
    });
    if (modelSelection.model) {
      nextConfig = applyPrimaryModel(nextConfig, modelSelection.model);
    }
  }

  await warnIfModelConfigLooksOff(nextConfig, prompter);

  const gateway = await configureGatewayForOnboarding({
    flow,
    baseConfig,
    nextConfig,
    localPort,
    quickstartGateway,
    prompter,
    runtime,
  });
  nextConfig = gateway.nextConfig;
  const settings = gateway.settings;

  if (opts.skipChannels ?? opts.skipProviders) {
    await prompter.note(
      t("wizard", "channels.skip", "Skipping channel setup."),
      t("wizard", "channels.title", "Channels"),
    );
  } else {
    const quickstartAllowFromChannels =
      flow === "quickstart"
        ? listChannelPlugins()
            .filter((plugin) => plugin.meta.quickstartAllowFrom)
            .map((plugin) => plugin.id)
        : [];
    nextConfig = await setupChannels(nextConfig, runtime, prompter, {
      allowSignalInstall: true,
      forceAllowFromChannels: quickstartAllowFromChannels,
      skipDmPolicyPrompt: flow === "quickstart",
      skipConfirm: flow === "quickstart",
      quickstartDefaults: flow === "quickstart",
    });
  }

  await writeConfigFile(nextConfig);
  logConfigUpdated(runtime);
  await ensureWorkspaceAndSessions(workspaceDir, runtime, {
    skipBootstrap: Boolean(nextConfig.agents?.defaults?.skipBootstrap),
  });

  if (opts.skipSkills) {
    await prompter.note(
      t("wizard", "skills.skip", "Skipping skills setup."),
      t("wizard", "skills.title", "Skills"),
    );
  } else {
    nextConfig = await setupSkills(nextConfig, workspaceDir, runtime, prompter);
  }

  // Setup hooks (session memory on /new)
  nextConfig = await setupInternalHooks(nextConfig, runtime, prompter);

  nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
  await writeConfigFile(nextConfig);

  const { launchedTui } = await finalizeOnboardingWizard({
    flow,
    opts,
    baseConfig,
    nextConfig,
    workspaceDir,
    settings,
    prompter,
    runtime,
  });
  if (launchedTui) {
    return;
  }
}
