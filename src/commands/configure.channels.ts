import { getChannelPlugin, listChannelPlugins } from "../channels/plugins/index.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import { CONFIG_PATH } from "../config/config.js";
import { tc, tci } from "../i18n/index.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import { shortenHomePath } from "../utils.js";
import { confirm, select } from "./configure.shared.js";
import { guardCancel } from "./onboard-helpers.js";

export async function removeChannelConfigWizard(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
): Promise<OpenClawConfig> {
  let next = { ...cfg };

  const listConfiguredChannels = () =>
    listChannelPlugins()
      .map((plugin) => plugin.meta)
      .filter((meta) => next.channels?.[meta.id] !== undefined);

  while (true) {
    const configured = listConfiguredChannels();
    if (configured.length === 0) {
      note(
        [
          tc("channel.noConfig", "No channel config found in openclaw.json."),
          tci("channel.tipStatus", "Tip: `{cmd}` shows what is configured and enabled.", {
            cmd: formatCliCommand("openclaw channels status"),
          }),
        ].join("\n"),
        tc("channel.removeTitle", "Remove channel"),
      );
      return next;
    }

    const channel = guardCancel(
      await select({
        message: tc("channel.removeWhich", "Remove which channel config?"),
        options: [
          ...configured.map((meta) => ({
            value: meta.id,
            label: meta.label,
            hint: tc(
              "channel.credentialHint",
              "Deletes tokens + settings from config (credentials stay on disk)",
            ),
          })),
          { value: "done", label: tc("channel.done", "Done") },
        ],
      }),
      runtime,
    );

    if (channel === "done") {
      return next;
    }

    const label = getChannelPlugin(channel)?.meta.label ?? channel;
    const confirmed = guardCancel(
      await confirm({
        message: tci("channel.confirmDelete", "Delete {label} configuration from {configPath}?", {
          label,
          configPath: shortenHomePath(CONFIG_PATH),
        }),
        initialValue: false,
      }),
      runtime,
    );
    if (!confirmed) {
      continue;
    }

    const nextChannels: Record<string, unknown> = { ...next.channels };
    delete nextChannels[channel];
    next = {
      ...next,
      channels: Object.keys(nextChannels).length
        ? (nextChannels as OpenClawConfig["channels"])
        : undefined,
    };

    note(
      [
        tci("channel.removedBody", "{label} removed from config.", { label }),
        tc("channel.credentialsNote", "Note: credentials/sessions on disk are unchanged."),
      ].join("\n"),
      tc("channel.removedTitle", "Channel removed"),
    );
  }
}
