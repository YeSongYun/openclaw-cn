import { html, nothing } from "lit";
import type { SignalStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderSignalCard(params: {
  props: ChannelsProps;
  signal?: SignalStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, signal, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">Signal</div>
      <div class="card-sub">${t("channels.signal.sub", "signal-cli status and channel configuration.")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channels.configured", "Configured")}</span>
          <span>${signal?.configured ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
        </div>
        <div>
          <span class="label">${t("channels.running", "Running")}</span>
          <span>${signal?.running ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
        </div>
        <div>
          <span class="label">${t("channels.signal.baseUrl", "Base URL")}</span>
          <span>${signal?.baseUrl ?? t("channels.na", "n/a")}</span>
        </div>
        <div>
          <span class="label">${t("channels.lastStart", "Last start")}</span>
          <span>${signal?.lastStartAt ? formatRelativeTimestamp(signal.lastStartAt) : t("channels.na", "n/a")}</span>
        </div>
        <div>
          <span class="label">${t("channels.lastProbe", "Last probe")}</span>
          <span>${signal?.lastProbeAt ? formatRelativeTimestamp(signal.lastProbeAt) : t("channels.na", "n/a")}</span>
        </div>
      </div>

      ${
        signal?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${signal.lastError}
          </div>`
          : nothing
      }

      ${
        signal?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t("channels.probe", "Probe")} ${signal.probe.ok ? t("channels.probeOk", "ok") : t("channels.probeFailed", "failed")} ·
            ${signal.probe.status ?? ""} ${signal.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "signal", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channels.probe", "Probe")}
        </button>
      </div>
    </div>
  `;
}
