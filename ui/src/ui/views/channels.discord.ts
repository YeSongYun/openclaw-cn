import { html, nothing } from "lit";
import type { DiscordStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderDiscordCard(params: {
  props: ChannelsProps;
  discord?: DiscordStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, discord, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">Discord</div>
      <div class="card-sub">${t("channels.discord.sub", "Bot status and channel configuration.")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channels.configured", "Configured")}</span>
          <span>${discord?.configured ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
        </div>
        <div>
          <span class="label">${t("channels.running", "Running")}</span>
          <span>${discord?.running ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
        </div>
        <div>
          <span class="label">${t("channels.lastStart", "Last start")}</span>
          <span>${discord?.lastStartAt ? formatRelativeTimestamp(discord.lastStartAt) : t("channels.na", "n/a")}</span>
        </div>
        <div>
          <span class="label">${t("channels.lastProbe", "Last probe")}</span>
          <span>${discord?.lastProbeAt ? formatRelativeTimestamp(discord.lastProbeAt) : t("channels.na", "n/a")}</span>
        </div>
      </div>

      ${
        discord?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${discord.lastError}
          </div>`
          : nothing
      }

      ${
        discord?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t("channels.probe", "Probe")} ${discord.probe.ok ? t("channels.probeOk", "ok") : t("channels.probeFailed", "failed")} ·
            ${discord.probe.status ?? ""} ${discord.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "discord", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channels.probe", "Probe")}
        </button>
      </div>
    </div>
  `;
}
