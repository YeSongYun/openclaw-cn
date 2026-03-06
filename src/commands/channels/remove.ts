import { resolveChannelDefaultAccountId } from "../../channels/plugins/helpers.js";
import {
  getChannelPlugin,
  listChannelPlugins,
  normalizeChannelId,
} from "../../channels/plugins/index.js";
import { type OpenClawConfig, writeConfigFile } from "../../config/config.js";
import { tch, tchi } from "../../i18n/index.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../routing/session-key.js";
import { defaultRuntime, type RuntimeEnv } from "../../runtime.js";
import { deleteTelegramUpdateOffset } from "../../telegram/update-offset-store.js";
import { createClackPrompter } from "../../wizard/clack-prompter.js";
import { type ChatChannel, channelLabel, requireValidConfig, shouldUseWizard } from "./shared.js";

export type ChannelsRemoveOptions = {
  channel?: string;
  account?: string;
  delete?: boolean;
};

function listAccountIds(cfg: OpenClawConfig, channel: ChatChannel): string[] {
  const plugin = getChannelPlugin(channel);
  if (!plugin) {
    return [];
  }
  return plugin.config.listAccountIds(cfg);
}

export async function channelsRemoveCommand(
  opts: ChannelsRemoveOptions,
  runtime: RuntimeEnv = defaultRuntime,
  params?: { hasFlags?: boolean },
) {
  const cfg = await requireValidConfig(runtime);
  if (!cfg) {
    return;
  }

  const useWizard = shouldUseWizard(params);
  const prompter = useWizard ? createClackPrompter() : null;
  let channel: ChatChannel | null = normalizeChannelId(opts.channel);
  let accountId = normalizeAccountId(opts.account);
  const deleteConfig = Boolean(opts.delete);

  if (useWizard && prompter) {
    await prompter.intro(tch("remove.intro", "Remove channel account"));
    const selectedChannel = await prompter.select({
      message: tch("remove.selectChannel", "Channel"),
      options: listChannelPlugins().map((plugin) => ({
        value: plugin.id,
        label: plugin.meta.label,
      })),
    });
    channel = selectedChannel;

    accountId = await (async () => {
      const ids = listAccountIds(cfg, selectedChannel);
      const choice = await prompter.select({
        message: tch("remove.selectAccount", "Account"),
        options: ids.map((id) => ({
          value: id,
          label: id === DEFAULT_ACCOUNT_ID ? tch("remove.defaultAccount", "default (primary)") : id,
        })),
        initialValue: ids[0] ?? DEFAULT_ACCOUNT_ID,
      });
      return normalizeAccountId(choice);
    })();

    const wantsDisable = await prompter.confirm({
      message: tchi(
        "remove.confirmDisable",
        'Disable {channel} account "{accountId}"? (keeps config)',
        {
          channel: channelLabel(selectedChannel),
          accountId: accountId ?? DEFAULT_ACCOUNT_ID,
        },
      ),
      initialValue: true,
    });
    if (!wantsDisable) {
      await prompter.outro(tch("remove.cancelled", "Cancelled."));
      return;
    }
  } else {
    if (!channel) {
      runtime.error(tch("remove.channelRequired", "Channel is required. Use --channel <name>."));
      runtime.exit(1);
      return;
    }
    if (!deleteConfig) {
      const confirm = createClackPrompter();
      const ok = await confirm.confirm({
        message: tchi(
          "remove.confirmDisable",
          'Disable {channel} account "{accountId}"? (keeps config)',
          {
            channel: channelLabel(channel),
            accountId: accountId ?? DEFAULT_ACCOUNT_ID,
          },
        ),
        initialValue: true,
      });
      if (!ok) {
        return;
      }
    }
  }

  const plugin = getChannelPlugin(channel);
  if (!plugin) {
    runtime.error(
      tchi("remove.unknownChannel", "Unknown channel: {channel}", { channel: String(channel) }),
    );
    runtime.exit(1);
    return;
  }

  const resolvedAccountId =
    normalizeAccountId(accountId) ?? resolveChannelDefaultAccountId({ plugin, cfg });
  const accountKey = resolvedAccountId || DEFAULT_ACCOUNT_ID;

  let next = { ...cfg };
  if (deleteConfig) {
    if (!plugin.config.deleteAccount) {
      runtime.error(
        tchi("remove.noDeleteSupport", "Channel {channel} does not support delete.", {
          channel: String(channel),
        }),
      );
      runtime.exit(1);
      return;
    }
    next = plugin.config.deleteAccount({
      cfg: next,
      accountId: resolvedAccountId,
    });

    // Clean up Telegram polling offset to prevent stale offset on bot token change (#18233)
    if (channel === "telegram") {
      await deleteTelegramUpdateOffset({ accountId: resolvedAccountId });
    }
  } else {
    if (!plugin.config.setAccountEnabled) {
      runtime.error(
        tchi("remove.noDisableSupport", "Channel {channel} does not support disable.", {
          channel: String(channel),
        }),
      );
      runtime.exit(1);
      return;
    }
    next = plugin.config.setAccountEnabled({
      cfg: next,
      accountId: resolvedAccountId,
      enabled: false,
    });
  }

  await writeConfigFile(next);
  if (useWizard && prompter) {
    await prompter.outro(
      deleteConfig
        ? tchi("remove.deleted", 'Deleted {channel} account "{accountId}".', {
            channel: channelLabel(channel),
            accountId: accountKey,
          })
        : tchi("remove.disabled", 'Disabled {channel} account "{accountId}".', {
            channel: channelLabel(channel),
            accountId: accountKey,
          }),
    );
  } else {
    runtime.log(
      deleteConfig
        ? tchi("remove.deleted", 'Deleted {channel} account "{accountId}".', {
            channel: channelLabel(channel),
            accountId: accountKey,
          })
        : tchi("remove.disabled", 'Disabled {channel} account "{accountId}".', {
            channel: channelLabel(channel),
            accountId: accountKey,
          }),
    );
  }
}
