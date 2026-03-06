import type { OpenClawConfig } from "../../../config/config.js";
import { hasConfiguredSecretInput } from "../../../config/types.secrets.js";
import { tch, tchi } from "../../../i18n/index.js";
import { DEFAULT_ACCOUNT_ID } from "../../../routing/session-key.js";
import {
  listSlackAccountIds,
  resolveDefaultSlackAccountId,
  resolveSlackAccount,
} from "../../../slack/accounts.js";
import { resolveSlackChannelAllowlist } from "../../../slack/resolve-channels.js";
import { resolveSlackUserAllowlist } from "../../../slack/resolve-users.js";
import { formatDocsLink } from "../../../terminal/links.js";
import type { WizardPrompter } from "../../../wizard/prompts.js";
import type { ChannelOnboardingAdapter, ChannelOnboardingDmPolicy } from "../onboarding-types.js";
import { configureChannelAccessWithAllowlist } from "./channel-access-configure.js";
import {
  parseMentionOrPrefixedId,
  noteChannelLookupFailure,
  noteChannelLookupSummary,
  patchChannelConfigForAccount,
  promptLegacyChannelAllowFrom,
  promptSingleChannelSecretInput,
  resolveAccountIdForConfigure,
  resolveOnboardingAccountId,
  setAccountGroupPolicyForChannel,
  setLegacyChannelDmPolicyWithAllowFrom,
  setOnboardingChannelEnabled,
} from "./helpers.js";

const channel = "slack" as const;

function buildSlackManifest(botName: string) {
  const safeName = botName.trim() || "OpenClaw";
  const manifest = {
    display_information: {
      name: safeName,
      description: `${safeName} connector for OpenClaw`,
    },
    features: {
      bot_user: {
        display_name: safeName,
        always_online: false,
      },
      app_home: {
        messages_tab_enabled: true,
        messages_tab_read_only_enabled: false,
      },
      slash_commands: [
        {
          command: "/openclaw",
          description: "Send a message to OpenClaw",
          should_escape: false,
        },
      ],
    },
    oauth_config: {
      scopes: {
        bot: [
          "chat:write",
          "channels:history",
          "channels:read",
          "groups:history",
          "im:history",
          "mpim:history",
          "users:read",
          "app_mentions:read",
          "reactions:read",
          "reactions:write",
          "pins:read",
          "pins:write",
          "emoji:read",
          "commands",
          "files:read",
          "files:write",
        ],
      },
    },
    settings: {
      socket_mode_enabled: true,
      event_subscriptions: {
        bot_events: [
          "app_mention",
          "message.channels",
          "message.groups",
          "message.im",
          "message.mpim",
          "reaction_added",
          "reaction_removed",
          "member_joined_channel",
          "member_left_channel",
          "channel_rename",
          "pin_added",
          "pin_removed",
        ],
      },
    },
  };
  return JSON.stringify(manifest, null, 2);
}

async function noteSlackTokenHelp(prompter: WizardPrompter, botName: string): Promise<void> {
  const manifest = buildSlackManifest(botName);
  await prompter.note(
    [
      tch(
        "onboard.slack.tokenHelp1",
        "1) Slack API → Create App → From scratch or From manifest (with the JSON below)",
      ),
      tch(
        "onboard.slack.tokenHelp2",
        "2) Add Socket Mode + enable it to get the app-level token (xapp-...)",
      ),
      tch("onboard.slack.tokenHelp3", "3) Install App to workspace to get the xoxb- bot token"),
      tch("onboard.slack.tokenHelp4", "4) Enable Event Subscriptions (socket) for message events"),
      tch("onboard.slack.tokenHelp5", "5) App Home → enable the Messages tab for DMs"),
      tch("onboard.slack.tokenHelpTip", "Tip: set SLACK_BOT_TOKEN + SLACK_APP_TOKEN in your env."),
      `Docs: ${formatDocsLink("/slack", "slack")}`,
      "",
      tch("onboard.slack.manifestLabel", "Manifest (JSON):"),
      manifest,
    ].join("\n"),
    tch("onboard.slack.tokenHelpTitle", "Slack socket mode tokens"),
  );
}

function setSlackChannelAllowlist(
  cfg: OpenClawConfig,
  accountId: string,
  channelKeys: string[],
): OpenClawConfig {
  const channels = Object.fromEntries(channelKeys.map((key) => [key, { allow: true }]));
  return patchChannelConfigForAccount({
    cfg,
    channel: "slack",
    accountId,
    patch: { channels },
  });
}

async function promptSlackAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  const accountId = resolveOnboardingAccountId({
    accountId: params.accountId,
    defaultAccountId: resolveDefaultSlackAccountId(params.cfg),
  });
  const resolved = resolveSlackAccount({ cfg: params.cfg, accountId });
  const token = resolved.userToken ?? resolved.botToken ?? "";
  const existing =
    params.cfg.channels?.slack?.allowFrom ?? params.cfg.channels?.slack?.dm?.allowFrom ?? [];
  const parseId = (value: string) =>
    parseMentionOrPrefixedId({
      value,
      mentionPattern: /^<@([A-Z0-9]+)>$/i,
      prefixPattern: /^(slack:|user:)/i,
      idPattern: /^[A-Z][A-Z0-9]+$/i,
      normalizeId: (id) => id.toUpperCase(),
    });

  return promptLegacyChannelAllowFrom({
    cfg: params.cfg,
    channel: "slack",
    prompter: params.prompter,
    existing,
    token,
    noteTitle: tch("onboard.slack.allowlistTitle", "Slack allowlist"),
    noteLines: [
      tch(
        "onboard.slack.allowlistNote1",
        "Allowlist Slack DMs by username (we resolve to user ids).",
      ),
      tch("onboard.slack.allowlistNote2", "Examples:"),
      tch("onboard.slack.allowlistNote3", "- U12345678"),
      tch("onboard.slack.allowlistNote4", "- @alice"),
      tch("onboard.slack.allowlistNote5", "Multiple entries: comma-separated."),
      `Docs: ${formatDocsLink("/slack", "slack")}`,
    ],
    message: tch("onboard.slack.allowFromMessage", "Slack allowFrom (usernames or ids)"),
    placeholder: "@alice, U12345678",
    parseId,
    invalidWithoutTokenNote: tch(
      "onboard.slack.noTokenNote",
      "Slack token missing; use user ids (or mention form) only.",
    ),
    resolveEntries: ({ token, entries }) =>
      resolveSlackUserAllowlist({
        token,
        entries,
      }),
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Slack",
  channel,
  policyKey: "channels.slack.dmPolicy",
  allowFromKey: "channels.slack.allowFrom",
  getCurrent: (cfg) =>
    cfg.channels?.slack?.dmPolicy ?? cfg.channels?.slack?.dm?.policy ?? "pairing",
  setPolicy: (cfg, policy) =>
    setLegacyChannelDmPolicyWithAllowFrom({
      cfg,
      channel: "slack",
      dmPolicy: policy,
    }),
  promptAllowFrom: promptSlackAllowFrom,
};

export const slackOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listSlackAccountIds(cfg).some((accountId) => {
      const account = resolveSlackAccount({ cfg, accountId });
      const hasBotToken =
        Boolean(account.botToken) || hasConfiguredSecretInput(account.config.botToken);
      const hasAppToken =
        Boolean(account.appToken) || hasConfiguredSecretInput(account.config.appToken);
      return hasBotToken && hasAppToken;
    });
    const statusText = configured
      ? tch("onboard.slack.statusConfigured", "configured")
      : tch("onboard.slack.statusNeedsTokens", "needs tokens");
    return {
      channel,
      configured,
      statusLines: [
        tchi("onboard.slack.statusLine", `Slack: ${statusText}`, { status: statusText }),
      ],
      selectionHint: statusText,
      quickstartScore: configured ? 2 : 1,
    };
  },
  configure: async ({ cfg, prompter, options, accountOverrides, shouldPromptAccountIds }) => {
    const defaultSlackAccountId = resolveDefaultSlackAccountId(cfg);
    const slackAccountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "Slack",
      accountOverride: accountOverrides.slack,
      shouldPromptAccountIds,
      listAccountIds: listSlackAccountIds,
      defaultAccountId: defaultSlackAccountId,
    });

    let next = cfg;
    const resolvedAccount = resolveSlackAccount({
      cfg: next,
      accountId: slackAccountId,
    });
    const hasConfiguredBotToken = hasConfiguredSecretInput(resolvedAccount.config.botToken);
    const hasConfiguredAppToken = hasConfiguredSecretInput(resolvedAccount.config.appToken);
    const hasConfigTokens = hasConfiguredBotToken && hasConfiguredAppToken;
    const accountConfigured =
      Boolean(resolvedAccount.botToken && resolvedAccount.appToken) || hasConfigTokens;
    const allowEnv = slackAccountId === DEFAULT_ACCOUNT_ID;
    const canUseBotEnv =
      allowEnv && !hasConfiguredBotToken && Boolean(process.env.SLACK_BOT_TOKEN?.trim());
    const canUseAppEnv =
      allowEnv && !hasConfiguredAppToken && Boolean(process.env.SLACK_APP_TOKEN?.trim());
    let resolvedBotTokenForAllowlist = resolvedAccount.botToken;
    const slackBotName = String(
      await prompter.text({
        message: tch("onboard.slack.botNameMessage", "Slack bot display name (used for manifest)"),
        initialValue: "OpenClaw",
      }),
    ).trim();
    if (!accountConfigured) {
      await noteSlackTokenHelp(prompter, slackBotName);
    }
    const botTokenResult = await promptSingleChannelSecretInput({
      cfg: next,
      prompter,
      providerHint: "slack-bot",
      credentialLabel: tch("onboard.slack.botTokenLabel", "Slack bot token"),
      secretInputMode: options?.secretInputMode,
      accountConfigured: Boolean(resolvedAccount.botToken) || hasConfiguredBotToken,
      canUseEnv: canUseBotEnv,
      hasConfigToken: hasConfiguredBotToken,
      envPrompt: tch("onboard.slack.botTokenEnvPrompt", "SLACK_BOT_TOKEN detected. Use env var?"),
      keepPrompt: tch(
        "onboard.slack.botTokenKeepPrompt",
        "Slack bot token already configured. Keep it?",
      ),
      inputPrompt: tch("onboard.slack.botTokenInputPrompt", "Enter Slack bot token (xoxb-...)"),
      preferredEnvVar: allowEnv ? "SLACK_BOT_TOKEN" : undefined,
    });
    if (botTokenResult.action === "use-env") {
      resolvedBotTokenForAllowlist = process.env.SLACK_BOT_TOKEN?.trim() || undefined;
    } else if (botTokenResult.action === "set") {
      next = patchChannelConfigForAccount({
        cfg: next,
        channel: "slack",
        accountId: slackAccountId,
        patch: { botToken: botTokenResult.value },
      });
      resolvedBotTokenForAllowlist = botTokenResult.resolvedValue;
    }

    const appTokenResult = await promptSingleChannelSecretInput({
      cfg: next,
      prompter,
      providerHint: "slack-app",
      credentialLabel: tch("onboard.slack.appTokenLabel", "Slack app token"),
      secretInputMode: options?.secretInputMode,
      accountConfigured: Boolean(resolvedAccount.appToken) || hasConfiguredAppToken,
      canUseEnv: canUseAppEnv,
      hasConfigToken: hasConfiguredAppToken,
      envPrompt: tch("onboard.slack.appTokenEnvPrompt", "SLACK_APP_TOKEN detected. Use env var?"),
      keepPrompt: tch(
        "onboard.slack.appTokenKeepPrompt",
        "Slack app token already configured. Keep it?",
      ),
      inputPrompt: tch("onboard.slack.appTokenInputPrompt", "Enter Slack app token (xapp-...)"),
      preferredEnvVar: allowEnv ? "SLACK_APP_TOKEN" : undefined,
    });
    if (appTokenResult.action === "set") {
      next = patchChannelConfigForAccount({
        cfg: next,
        channel: "slack",
        accountId: slackAccountId,
        patch: { appToken: appTokenResult.value },
      });
    }

    next = await configureChannelAccessWithAllowlist({
      cfg: next,
      prompter,
      label: "Slack channels",
      currentPolicy: resolvedAccount.config.groupPolicy ?? "allowlist",
      currentEntries: Object.entries(resolvedAccount.config.channels ?? {})
        .filter(([, value]) => value?.allow !== false && value?.enabled !== false)
        .map(([key]) => key),
      placeholder: "#general, #private, C123",
      updatePrompt: Boolean(resolvedAccount.config.channels),
      setPolicy: (cfg, policy) =>
        setAccountGroupPolicyForChannel({
          cfg,
          channel: "slack",
          accountId: slackAccountId,
          groupPolicy: policy,
        }),
      resolveAllowlist: async ({ cfg, entries }) => {
        let keys = entries;
        const accountWithTokens = resolveSlackAccount({
          cfg,
          accountId: slackAccountId,
        });
        const activeBotToken = accountWithTokens.botToken || resolvedBotTokenForAllowlist || "";
        if (activeBotToken && entries.length > 0) {
          try {
            const resolved = await resolveSlackChannelAllowlist({
              token: activeBotToken,
              entries,
            });
            const resolvedKeys = resolved
              .filter((entry) => entry.resolved && entry.id)
              .map((entry) => entry.id as string);
            const unresolved = resolved
              .filter((entry) => !entry.resolved)
              .map((entry) => entry.input);
            keys = [...resolvedKeys, ...unresolved.map((entry) => entry.trim()).filter(Boolean)];
            await noteChannelLookupSummary({
              prompter,
              label: "Slack channels",
              resolvedSections: [
                { title: tch("onboard.slack.resolvedTitle", "Resolved"), values: resolvedKeys },
              ],
              unresolved,
            });
          } catch (err) {
            await noteChannelLookupFailure({
              prompter,
              label: "Slack channels",
              error: err,
            });
          }
        }
        return keys;
      },
      applyAllowlist: ({ cfg, resolved }) => {
        return setSlackChannelAllowlist(cfg, slackAccountId, resolved);
      },
    });

    return { cfg: next, accountId: slackAccountId };
  },
  dmPolicy,
  disable: (cfg) => setOnboardingChannelEnabled(cfg, channel, false),
};
