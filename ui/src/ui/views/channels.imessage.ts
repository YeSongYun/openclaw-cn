import { html, nothing } from "lit";
import type { IMessageStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderIMessageCard(params: {
  props: ChannelsProps;
  imessage?: IMessageStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, imessage, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">iMessage</div>
      <div class="card-sub">${t("channels.imessage.sub", "macOS bridge status and channel configuration.")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channels.configured", "Configured")}</span>
          <span>${imessage?.configured ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
        </div>
        <div>
          <span class="label">${t("channels.running", "Running")}</span>
          <span>${imessage?.running ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
        </div>
        <div>
          <span class="label">${t("channels.lastStart", "Last start")}</span>
          <span>${imessage?.lastStartAt ? formatRelativeTimestamp(imessage.lastStartAt) : t("channels.na", "n/a")}</span>
        </div>
        <div>
          <span class="label">${t("channels.lastProbe", "Last probe")}</span>
          <span>${imessage?.lastProbeAt ? formatRelativeTimestamp(imessage.lastProbeAt) : t("channels.na", "n/a")}</span>
        </div>
      </div>

      ${
        imessage?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${imessage.lastError}
          </div>`
          : nothing
      }

      ${
        imessage?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t("channels.probe", "Probe")} ${imessage.probe.ok ? t("channels.probeOk", "ok") : t("channels.probeFailed", "failed")} ·
            ${imessage.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "imessage", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channels.probe", "Probe")}
        </button>
      </div>
    </div>
  `;
}
