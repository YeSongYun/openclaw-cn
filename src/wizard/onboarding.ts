import { formatCliCommand } from "../cli/command-format.js";
import type {
  GatewayAuthChoice,
  OnboardMode,
  OnboardOptions,
  ResetScope,
} from "../commands/onboard-types.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  DEFAULT_GATEWAY_PORT,
  readConfigFileSnapshot,
  resolveGatewayPort,
  writeConfigFile,
} from "../config/config.js";
import { normalizeSecretInputString } from "../config/types.secrets.js";
import { tw } from "../i18n/index.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath } from "../utils.js";
import { resolveOnboardingSecretInputString } from "./onboarding.secret-input.js";
import type { QuickstartGatewayDefaults, WizardFlow } from "./onboarding.types.js";
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
      tw("security.warning", "Security warning — please read."),
      "",
      tw("security.beta", "OpenClaw is a hobby project and still in beta. Expect sharp edges."),
      tw(
        "security.personalAgent",
        "By default, OpenClaw is a personal agent: one trusted operator boundary.",
      ),
      tw("security.readFiles", "This bot can read files and run actions if tools are enabled."),
      tw("security.badPrompt", "A bad prompt can trick it into doing unsafe things."),
      "",
      tw(
        "security.multiTenantBoundary",
        "OpenClaw is not a hostile multi-tenant boundary by default.",
      ),
      tw(
        "security.multiTenantWarning",
        "If multiple users can message one tool-enabled agent, they share that delegated tool authority.",
      ),
      "",
      tw(
        "security.notComfortable",
        "If you’re not comfortable with security hardening and access control, don’t run OpenClaw.",
      ),
      tw(
        "security.askHelp",
        "Ask someone experienced to help before enabling tools or exposing it to the internet.",
      ),
      "",
      tw("security.baseline", "Recommended baseline:"),
      tw("security.pairing", "- Pairing/allowlists + mention gating."),
      tw(
        "security.baselineMultiuser",
        "- Multi-user/shared inbox: split trust boundaries (separate gateway/credentials, ideally separate OS users/hosts).",
      ),
      tw("security.sandbox", "- Sandbox + least-privilege tools."),
      tw(
        "security.baselineDmScope",
        "- Shared inboxes: isolate DM sessions (`session.dmScope: per-channel-peer`) and keep tool access minimal.",
      ),
      tw("security.secrets", "- Keep secrets out of the agent’s reachable filesystem."),
      tw(
        "security.strongModel",
        "- Use the strongest available model for any bot with tools or untrusted inboxes.",
      ),
      "",
      tw("security.runRegularly", "Run regularly:"),
      "openclaw security audit --deep",
      "openclaw security audit --fix",
      "",
      tw("security.mustRead", "Must read:") + " https://docs.openclaw.ai/gateway/security",
    ].join("\n"),
    tw("security.title", "Security"),
  );

  const ok = await params.prompter.confirm({
    message: tw(
      "security.confirm",
      "I understand this is personal-by-default and shared/multi-user use requires lock-down. Continue?",
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
  const onboardHelpers = await import("../commands/onboard-helpers.js");
  onboardHelpers.printWizardHeader(runtime);
  await prompter.intro(tw("intro", "OpenClaw onboarding"));
  await requireRiskAcknowledgement({ opts, prompter });

  const snapshot = await readConfigFileSnapshot();
  let baseConfig: OpenClawConfig = snapshot.valid ? snapshot.config : {};

  if (snapshot.exists && !snapshot.valid) {
    await prompter.note(
      onboardHelpers.summarizeExistingConfig(baseConfig),
      tw("config.invalid", "Invalid config"),
    );
    if (snapshot.issues.length > 0) {
      await prompter.note(
        [
          ...snapshot.issues.map((iss) => `- ${iss.path}: ${iss.message}`),
          "",
          "Docs: https://docs.openclaw.ai/gateway/configuration",
        ].join("\n"),
        tw("config.issues", "Config issues"),
      );
    }
    await prompter.outro(
      tw(
        "config.invalidRun",
        `Config invalid. Run \`${formatCliCommand("openclaw doctor")}\` to repair it, then re-run onboarding.`,
      ),
    );
    runtime.exit(1);
    return;
  }

  const quickstartHint = tw(
    "mode.quickstartHint",
    `Configure details later via ${formatCliCommand("openclaw configure")}.`,
  );
  const manualHint = tw("mode.manualHint", "Configure port, network, Tailscale, and auth options.");
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
      message: tw("mode.title", "Onboarding mode"),
      options: [
        { value: "quickstart", label: tw("mode.quickstart", "QuickStart"), hint: quickstartHint },
        { value: "advanced", label: tw("mode.manual", "Manual"), hint: manualHint },
      ],
      initialValue: "quickstart",
    }));

  if (opts.mode === "remote" && flow === "quickstart") {
    await prompter.note(
      tw(
        "mode.quickstartLocalOnly",
        "QuickStart only supports local gateways. Switching to Manual mode.",
      ),
      tw("mode.quickstart", "QuickStart"),
    );
    flow = "advanced";
  }

  if (snapshot.exists) {
    await prompter.note(
      onboardHelpers.summarizeExistingConfig(baseConfig),
      tw("config.existing", "Existing config detected"),
    );

    const action = await prompter.select({
      message: tw("config.handling", "Config handling"),
      options: [
        { value: "keep", label: tw("config.keep", "Use existing values") },
        { value: "modify", label: tw("config.modify", "Update values") },
        { value: "reset", label: tw("config.reset", "Reset") },
      ],
    });

    if (action === "reset") {
      const workspaceDefault =
        baseConfig.agents?.defaults?.workspace ?? onboardHelpers.DEFAULT_WORKSPACE;
      const resetScope = (await prompter.select({
        message: tw("reset.scope", "Reset scope"),
        options: [
          { value: "config", label: tw("reset.configOnly", "Config only") },
          {
            value: "config+creds+sessions",
            label: tw("reset.configCredsSessions", "Config + creds + sessions"),
          },
          {
            value: "full",
            label: tw("reset.full", "Full reset (config + creds + sessions + workspace)"),
          },
        ],
      })) as ResetScope;
      await onboardHelpers.handleReset(resetScope, resolveUserPath(workspaceDefault), runtime);
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
        return tw("gateway.bindLoopback", "Loopback (127.0.0.1)");
      }
      if (value === "lan") {
        return tw("gateway.bindLan", "LAN");
      }
      if (value === "custom") {
        return tw("gateway.bindCustom", "Custom IP");
      }
      if (value === "tailnet") {
        return tw("gateway.bindTailnet", "Tailnet (Tailscale IP)");
      }
      return tw("gateway.bindAuto", "Auto");
    };
    const formatAuth = (value: GatewayAuthChoice) => {
      if (value === "token") {
        return tw("gateway.authToken", "Token (default)");
      }
      return tw("gateway.authPassword", "Password");
    };
    const formatTailscale = (value: "off" | "serve" | "funnel") => {
      if (value === "off") {
        return tw("gateway.tailscaleOff", "Off");
      }
      if (value === "serve") {
        return tw("gateway.tailscaleServe", "Serve");
      }
      return tw("gateway.tailscaleFunnel", "Funnel");
    };
    const quickstartLines = quickstartGateway.hasExisting
      ? [
          tw("gateway.keepSettings", "Keeping your current gateway settings:"),
          `${tw("gateway.port", "Gateway port")}: ${quickstartGateway.port}`,
          `${tw("gateway.bind", "Gateway bind")}: ${formatBind(quickstartGateway.bind)}`,
          ...(quickstartGateway.bind === "custom" && quickstartGateway.customBindHost
            ? [
                `${tw("gateway.customIp", "Gateway custom IP")}: ${quickstartGateway.customBindHost}`,
              ]
            : []),
          `${tw("gateway.auth", "Gateway auth")}: ${formatAuth(quickstartGateway.authMode)}`,
          `${tw("gateway.tailscale", "Tailscale exposure")}: ${formatTailscale(quickstartGateway.tailscaleMode)}`,
          tw("gateway.directToChannels", "Direct to chat channels."),
        ]
      : [
          `${tw("gateway.port", "Gateway port")}: ${DEFAULT_GATEWAY_PORT}`,
          `${tw("gateway.bind", "Gateway bind")}: ${tw("gateway.bindLoopback", "Loopback (127.0.0.1)")}`,
          `${tw("gateway.auth", "Gateway auth")}: ${tw("gateway.authToken", "Token (default)")}`,
          `${tw("gateway.tailscale", "Tailscale exposure")}: ${tw("gateway.tailscaleOff", "Off")}`,
          tw("gateway.directToChannels", "Direct to chat channels."),
        ];
    await prompter.note(quickstartLines.join("\n"), tw("mode.quickstart", "QuickStart"));
  }

  const localPort = resolveGatewayPort(baseConfig);
  const localUrl = `ws://127.0.0.1:${localPort}`;
  let localGatewayPassword =
    process.env.OPENCLAW_GATEWAY_PASSWORD ??
    normalizeSecretInputString(baseConfig.gateway?.auth?.password);
  try {
    const resolvedGatewayPassword = await resolveOnboardingSecretInputString({
      config: baseConfig,
      value: baseConfig.gateway?.auth?.password,
      path: "gateway.auth.password",
      env: process.env,
    });
    if (resolvedGatewayPassword) {
      localGatewayPassword = resolvedGatewayPassword;
    }
  } catch (error) {
    await prompter.note(
      [
        "Could not resolve gateway.auth.password SecretRef for onboarding probe.",
        error instanceof Error ? error.message : String(error),
      ].join("\n"),
      tw("gatewayConfig.auth", "Gateway auth"),
    );
  }

  const localProbe = await onboardHelpers.probeGatewayReachable({
    url: localUrl,
    token: baseConfig.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN,
    password: localGatewayPassword,
  });
  const remoteUrl = baseConfig.gateway?.remote?.url?.trim() ?? "";
  const remoteProbe = remoteUrl
    ? await onboardHelpers.probeGatewayReachable({
        url: remoteUrl,
        token: normalizeSecretInputString(baseConfig.gateway?.remote?.token),
      })
    : null;

  const mode =
    opts.mode ??
    (flow === "quickstart"
      ? "local"
      : ((await prompter.select({
          message: tw("setup.title", "What do you want to set up?"),
          options: [
            {
              value: "local",
              label: tw("setup.local", "Local gateway (this machine)"),
              hint: localProbe.ok
                ? `${tw("setup.localReachable", "Gateway reachable")} (${localUrl})`
                : `${tw("setup.localNotDetected", "No gateway detected")} (${localUrl})`,
            },
            {
              value: "remote",
              label: tw("setup.remote", "Remote gateway (info-only)"),
              hint: !remoteUrl
                ? tw("setup.remoteNotConfigured", "No remote URL configured yet")
                : remoteProbe?.ok
                  ? `${tw("setup.remoteReachable", "Gateway reachable")} (${remoteUrl})`
                  : `${tw("setup.remoteUnreachable", "Configured but unreachable")} (${remoteUrl})`,
            },
          ],
        })) as OnboardMode));

  if (mode === "remote") {
    const { promptRemoteGatewayConfig } = await import("../commands/onboard-remote.js");
    const { logConfigUpdated } = await import("../config/logging.js");
    let nextConfig = await promptRemoteGatewayConfig(baseConfig, prompter, {
      secretInputMode: opts.secretInputMode,
    });
    nextConfig = onboardHelpers.applyWizardMetadata(nextConfig, { command: "onboard", mode });
    await writeConfigFile(nextConfig);
    logConfigUpdated(runtime);
    await prompter.outro(tw("setup.remoteConfigured", "Remote gateway configured."));
    return;
  }

  const workspaceInput =
    opts.workspace ??
    (flow === "quickstart"
      ? (baseConfig.agents?.defaults?.workspace ?? onboardHelpers.DEFAULT_WORKSPACE)
      : await prompter.text({
          message: tw("workspace.title", "Workspace directory"),
          initialValue: baseConfig.agents?.defaults?.workspace ?? onboardHelpers.DEFAULT_WORKSPACE,
        }));

  const workspaceDir = resolveUserPath(workspaceInput.trim() || onboardHelpers.DEFAULT_WORKSPACE);

  const { applyOnboardingLocalWorkspaceConfig } = await import("../commands/onboard-config.js");
  let nextConfig: OpenClawConfig = applyOnboardingLocalWorkspaceConfig(baseConfig, workspaceDir);

  const { ensureAuthProfileStore } = await import("../agents/auth-profiles.js");
  const { promptAuthChoiceGrouped } = await import("../commands/auth-choice-prompt.js");
  const { promptCustomApiConfig } = await import("../commands/onboard-custom.js");
  const { applyAuthChoice, resolvePreferredProviderForAuthChoice, warnIfModelConfigLooksOff } =
    await import("../commands/auth-choice.js");
  const { applyPrimaryModel, promptDefaultModel } = await import("../commands/model-picker.js");

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

  if (authChoice === "custom-api-key") {
    const customResult = await promptCustomApiConfig({
      prompter,
      runtime,
      config: nextConfig,
      secretInputMode: opts.secretInputMode,
    });
    nextConfig = customResult.config;
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
      includeVllm: true,
      preferredProvider: resolvePreferredProviderForAuthChoice(authChoice),
    });
    if (modelSelection.config) {
      nextConfig = modelSelection.config;
    }
    if (modelSelection.model) {
      nextConfig = applyPrimaryModel(nextConfig, modelSelection.model);
    }
  }

  await warnIfModelConfigLooksOff(nextConfig, prompter);

  const { configureGatewayForOnboarding } = await import("./onboarding.gateway-config.js");
  const gateway = await configureGatewayForOnboarding({
    flow,
    baseConfig,
    nextConfig,
    localPort,
    quickstartGateway,
    secretInputMode: opts.secretInputMode,
    prompter,
    runtime,
  });
  nextConfig = gateway.nextConfig;
  const settings = gateway.settings;

  if (opts.skipChannels ?? opts.skipProviders) {
    await prompter.note(
      tw("channels.skip", "Skipping channel setup."),
      tw("channels.title", "Channels"),
    );
  } else {
    const { listChannelPlugins } = await import("../channels/plugins/index.js");
    const { setupChannels } = await import("../commands/onboard-channels.js");
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
      secretInputMode: opts.secretInputMode,
    });
  }

  await writeConfigFile(nextConfig);
  const { logConfigUpdated } = await import("../config/logging.js");
  logConfigUpdated(runtime);
  await onboardHelpers.ensureWorkspaceAndSessions(workspaceDir, runtime, {
    skipBootstrap: Boolean(nextConfig.agents?.defaults?.skipBootstrap),
  });

  if (opts.skipSkills) {
    await prompter.note(tw("skills.skip", "Skipping skills setup."), tw("skills.title", "Skills"));
  } else {
    const { setupSkills } = await import("../commands/onboard-skills.js");
    nextConfig = await setupSkills(nextConfig, workspaceDir, runtime, prompter);
  }

  // Setup hooks (session memory on /new)
  const { setupInternalHooks } = await import("../commands/onboard-hooks.js");
  nextConfig = await setupInternalHooks(nextConfig, runtime, prompter);

  nextConfig = onboardHelpers.applyWizardMetadata(nextConfig, { command: "onboard", mode });
  await writeConfigFile(nextConfig);

  const { finalizeOnboardingWizard } = await import("./onboarding.finalize.js");
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
