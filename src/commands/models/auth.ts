import { confirm as clackConfirm, select as clackSelect, text as clackText } from "@clack/prompts";
import {
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { upsertAuthProfile } from "../../agents/auth-profiles.js";
import type { AuthProfileCredential } from "../../agents/auth-profiles/types.js";
import { normalizeProviderId } from "../../agents/model-selection.js";
import { resolveDefaultAgentWorkspaceDir } from "../../agents/workspace.js";
import { formatCliCommand } from "../../cli/command-format.js";
import { parseDurationMs } from "../../cli/parse-duration.js";
import { logConfigUpdated } from "../../config/logging.js";
import { ta, tai } from "../../i18n/index.js";
import { resolvePluginProviders } from "../../plugins/providers.js";
import type { ProviderAuthResult, ProviderPlugin } from "../../plugins/types.js";
import type { RuntimeEnv } from "../../runtime.js";
import { stylePromptHint, stylePromptMessage } from "../../terminal/prompt-style.js";
import { createClackPrompter } from "../../wizard/clack-prompter.js";
import { validateAnthropicSetupToken } from "../auth-token.js";
import { isRemoteEnvironment } from "../oauth-env.js";
import { createVpsAwareOAuthHandlers } from "../oauth-flow.js";
import { applyAuthProfileConfig } from "../onboard-auth.js";
import { openUrl } from "../onboard-helpers.js";
import {
  applyDefaultModel,
  mergeConfigPatch,
  pickAuthMethod,
  resolveProviderMatch,
} from "../provider-auth-helpers.js";
import { loadValidConfigOrThrow, updateConfig } from "./shared.js";

const confirm = (params: Parameters<typeof clackConfirm>[0]) =>
  clackConfirm({
    ...params,
    message: stylePromptMessage(params.message),
  });
const text = (params: Parameters<typeof clackText>[0]) =>
  clackText({
    ...params,
    message: stylePromptMessage(params.message),
  });
const select = <T>(params: Parameters<typeof clackSelect<T>>[0]) =>
  clackSelect({
    ...params,
    message: stylePromptMessage(params.message),
    options: params.options.map((opt) =>
      opt.hint === undefined ? opt : { ...opt, hint: stylePromptHint(opt.hint) },
    ),
  });

type TokenProvider = "anthropic";

function resolveTokenProvider(raw?: string): TokenProvider | "custom" | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = normalizeProviderId(trimmed);
  if (normalized === "anthropic") {
    return "anthropic";
  }
  return "custom";
}

function resolveDefaultTokenProfileId(provider: string): string {
  return `${normalizeProviderId(provider)}:manual`;
}

export async function modelsAuthSetupTokenCommand(
  opts: { provider?: string; yes?: boolean },
  runtime: RuntimeEnv,
) {
  const provider = resolveTokenProvider(opts.provider ?? "anthropic");
  if (provider !== "anthropic") {
    throw new Error(
      ta(
        "modelsAuth.setupToken.onlyAnthropic",
        "Only --provider anthropic is supported for setup-token.",
      ),
    );
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      ta("modelsAuth.setupToken.ttyRequired", "setup-token requires an interactive TTY."),
    );
  }

  if (!opts.yes) {
    const proceed = await confirm({
      message: ta(
        "modelsAuth.setupToken.confirmRun",
        "Have you run `claude setup-token` and copied the token?",
      ),
      initialValue: true,
    });
    if (!proceed) {
      return;
    }
  }

  const tokenInput = await text({
    message: ta("modelsAuth.setupToken.pasteToken", "Paste Anthropic setup-token"),
    validate: (value) => validateAnthropicSetupToken(String(value ?? "")),
  });
  const token = String(tokenInput ?? "").trim();
  const profileId = resolveDefaultTokenProfileId(provider);

  upsertAuthProfile({
    profileId,
    credential: {
      type: "token",
      provider,
      token,
    },
  });

  await updateConfig((cfg) =>
    applyAuthProfileConfig(cfg, {
      profileId,
      provider,
      mode: "token",
    }),
  );

  logConfigUpdated(runtime);
  runtime.log(`Auth profile: ${profileId} (${provider}/token)`);
}

export async function modelsAuthPasteTokenCommand(
  opts: {
    provider?: string;
    profileId?: string;
    expiresIn?: string;
  },
  runtime: RuntimeEnv,
) {
  const rawProvider = opts.provider?.trim();
  if (!rawProvider) {
    throw new Error(ta("modelsAuth.pasteToken.missingProvider", "Missing --provider."));
  }
  const provider = normalizeProviderId(rawProvider);
  const profileId = opts.profileId?.trim() || resolveDefaultTokenProfileId(provider);

  const tokenInput = await text({
    message: tai("modelsAuth.pasteToken.pasteFor", `Paste token for ${provider}`, { provider }),
    validate: (value) =>
      value?.trim() ? undefined : ta("modelsAuth.pasteToken.required", "Required"),
  });
  const token = String(tokenInput ?? "").trim();

  const expires =
    opts.expiresIn?.trim() && opts.expiresIn.trim().length > 0
      ? Date.now() + parseDurationMs(String(opts.expiresIn ?? "").trim(), { defaultUnit: "d" })
      : undefined;

  upsertAuthProfile({
    profileId,
    credential: {
      type: "token",
      provider,
      token,
      ...(expires ? { expires } : {}),
    },
  });

  await updateConfig((cfg) => applyAuthProfileConfig(cfg, { profileId, provider, mode: "token" }));

  logConfigUpdated(runtime);
  runtime.log(`Auth profile: ${profileId} (${provider}/token)`);
}

export async function modelsAuthAddCommand(_opts: Record<string, never>, runtime: RuntimeEnv) {
  const provider = (await select({
    message: ta("modelsAuth.add.selectProvider", "Token provider"),
    options: [
      { value: "anthropic", label: "anthropic" },
      { value: "custom", label: ta("modelsAuth.add.customLabel", "custom (type provider id)") },
    ],
  })) as TokenProvider | "custom";

  const providerId =
    provider === "custom"
      ? normalizeProviderId(
          String(
            await text({
              message: ta("modelsAuth.add.providerId", "Provider id"),
              validate: (value) =>
                value?.trim() ? undefined : ta("modelsAuth.pasteToken.required", "Required"),
            }),
          ),
        )
      : provider;

  const method = (await select({
    message: ta("modelsAuth.add.selectMethod", "Token method"),
    options: [
      ...(providerId === "anthropic"
        ? [
            {
              value: "setup-token",
              label: ta("modelsAuth.add.setupTokenLabel", "setup-token (claude)"),
              hint: ta(
                "modelsAuth.add.setupTokenHint",
                "Paste a setup-token from `claude setup-token`",
              ),
            },
          ]
        : []),
      { value: "paste", label: ta("modelsAuth.add.pasteLabel", "paste token") },
    ],
  })) as "setup-token" | "paste";

  if (method === "setup-token") {
    await modelsAuthSetupTokenCommand({ provider: providerId }, runtime);
    return;
  }

  const profileIdDefault = resolveDefaultTokenProfileId(providerId);
  const profileId = String(
    await text({
      message: ta("modelsAuth.add.profileId", "Profile id"),
      initialValue: profileIdDefault,
      validate: (value) =>
        value?.trim() ? undefined : ta("modelsAuth.pasteToken.required", "Required"),
    }),
  ).trim();

  const wantsExpiry = await confirm({
    message: ta("modelsAuth.add.expiryConfirm", "Does this token expire?"),
    initialValue: false,
  });
  const expiresIn = wantsExpiry
    ? String(
        await text({
          message: ta("modelsAuth.add.expiryDuration", "Expires in (duration)"),
          initialValue: "365d",
          validate: (value) => {
            try {
              parseDurationMs(String(value ?? ""), { defaultUnit: "d" });
              return undefined;
            } catch {
              return ta(
                "modelsAuth.add.expiryFormatError",
                "Invalid duration (e.g. 365d, 12h, 30m)",
              );
            }
          },
        }),
      ).trim()
    : undefined;

  await modelsAuthPasteTokenCommand({ provider: providerId, profileId, expiresIn }, runtime);
}

type LoginOptions = {
  provider?: string;
  method?: string;
  setDefault?: boolean;
};

export function resolveRequestedLoginProviderOrThrow(
  providers: ProviderPlugin[],
  rawProvider?: string,
): ProviderPlugin | null {
  const requested = rawProvider?.trim();
  if (!requested) {
    return null;
  }
  const matched = resolveProviderMatch(providers, requested);
  if (matched) {
    return matched;
  }
  const available = providers
    .map((provider) => provider.id)
    .filter(Boolean)
    .toSorted((a, b) => a.localeCompare(b));
  const availableText = available.length > 0 ? available.join(", ") : "(none)";
  throw new Error(
    tai(
      "modelsAuth.login.unknownProviderError",
      `Unknown provider "${requested}". Loaded providers: ${availableText}. Verify plugins via \`${formatCliCommand("openclaw plugins list --json")}\`.`,
      {
        provider: requested,
        available: availableText,
        cmd: formatCliCommand("openclaw plugins list --json"),
      },
    ),
  );
}

function credentialMode(credential: AuthProfileCredential): "api_key" | "oauth" | "token" {
  if (credential.type === "api_key") {
    return "api_key";
  }
  if (credential.type === "token") {
    return "token";
  }
  return "oauth";
}

export async function modelsAuthLoginCommand(opts: LoginOptions, runtime: RuntimeEnv) {
  if (!process.stdin.isTTY) {
    throw new Error(
      ta("modelsAuth.login.ttyRequired", "models auth login requires an interactive TTY."),
    );
  }

  const config = await loadValidConfigOrThrow();
  const defaultAgentId = resolveDefaultAgentId(config);
  const agentDir = resolveAgentDir(config, defaultAgentId);
  const workspaceDir =
    resolveAgentWorkspaceDir(config, defaultAgentId) ?? resolveDefaultAgentWorkspaceDir();

  const providers = resolvePluginProviders({ config, workspaceDir });
  if (providers.length === 0) {
    throw new Error(
      tai(
        "modelsAuth.login.noProviders",
        `No provider plugins found. Install one via \`${formatCliCommand("openclaw plugins install")}\`.`,
        { cmd: formatCliCommand("openclaw plugins install") },
      ),
    );
  }

  const prompter = createClackPrompter();
  const requestedProvider = resolveRequestedLoginProviderOrThrow(providers, opts.provider);
  const selectedProvider =
    requestedProvider ??
    (await prompter
      .select({
        message: ta("modelsAuth.login.selectProvider", "Select a provider"),
        options: providers.map((provider) => ({
          value: provider.id,
          label: provider.label,
          hint: provider.docsPath ? `Docs: ${provider.docsPath}` : undefined,
        })),
      })
      .then((id) => resolveProviderMatch(providers, String(id))));

  if (!selectedProvider) {
    throw new Error(
      ta(
        "modelsAuth.login.unknownProvider",
        "Unknown provider. Use --provider <id> to pick a provider plugin.",
      ),
    );
  }

  const chosenMethod =
    pickAuthMethod(selectedProvider, opts.method) ??
    (selectedProvider.auth.length === 1
      ? selectedProvider.auth[0]
      : await prompter
          .select({
            message: tai(
              "modelsAuth.login.authMethodFor",
              `Auth method for ${selectedProvider.label}`,
              { label: selectedProvider.label },
            ),
            options: selectedProvider.auth.map((method) => ({
              value: method.id,
              label: method.label,
              hint: method.hint,
            })),
          })
          .then((id) => selectedProvider.auth.find((method) => method.id === String(id))));

  if (!chosenMethod) {
    throw new Error(
      ta("modelsAuth.login.unknownMethod", "Unknown auth method. Use --method <id> to select one."),
    );
  }

  const isRemote = isRemoteEnvironment();
  const result: ProviderAuthResult = await chosenMethod.run({
    config,
    agentDir,
    workspaceDir,
    prompter,
    runtime,
    isRemote,
    openUrl: async (url) => {
      await openUrl(url);
    },
    oauth: {
      createVpsAwareHandlers: (params) => createVpsAwareOAuthHandlers(params),
    },
  });

  for (const profile of result.profiles) {
    upsertAuthProfile({
      profileId: profile.profileId,
      credential: profile.credential,
      agentDir,
    });
  }

  await updateConfig((cfg) => {
    let next = cfg;
    if (result.configPatch) {
      next = mergeConfigPatch(next, result.configPatch);
    }
    for (const profile of result.profiles) {
      next = applyAuthProfileConfig(next, {
        profileId: profile.profileId,
        provider: profile.credential.provider,
        mode: credentialMode(profile.credential),
      });
    }
    if (opts.setDefault && result.defaultModel) {
      next = applyDefaultModel(next, result.defaultModel);
    }
    return next;
  });

  logConfigUpdated(runtime);
  for (const profile of result.profiles) {
    runtime.log(
      `Auth profile: ${profile.profileId} (${profile.credential.provider}/${credentialMode(profile.credential)})`,
    );
  }
  if (result.defaultModel) {
    runtime.log(
      opts.setDefault
        ? tai("modelsAuth.login.defaultModelSet", `Default model set to ${result.defaultModel}`, {
            model: result.defaultModel,
          })
        : tai(
            "modelsAuth.login.defaultModelAvailable",
            `Default model available: ${result.defaultModel} (use --set-default to apply)`,
            { model: result.defaultModel },
          ),
    );
  }
  if (result.notes && result.notes.length > 0) {
    await prompter.note(
      result.notes.join("\n"),
      ta("modelsAuth.login.providerNotes", "Provider notes"),
    );
  }
}
