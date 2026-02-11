import { html, nothing } from "lit";
import type { GoogleChatStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderGoogleChatCard(params: {
  props: ChannelsProps;
  googleChat?: GoogleChatStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, googleChat, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">Google Chat</div>
      <div class="card-sub">${t("channels.googlechat.sub", "Chat API webhook status and channel configuration.")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channels.configured", "Configured")}</span>
          <span>${googleChat ? (googleChat.configured ? t("channels.yes", "Yes") : t("channels.no", "No")) : t("channels.na", "n/a")}</span>
        </div>
        <div>
          <span class="label">${t("channels.running", "Running")}</span>
          <span>${googleChat ? (googleChat.running ? t("channels.yes", "Yes") : t("channels.no", "No")) : t("channels.na", "n/a")}</span>
        </div>
        <div>
          <span class="label">${t("channels.googlechat.credential", "Credential")}</span>
          <span>${googleChat?.credentialSource ?? t("channels.na", "n/a")}</span>
        </div>
        <div>
          <span class="label">${t("channels.googlechat.audience", "Audience")}</span>
          <span>
            ${
              googleChat?.audienceType
                ? `${googleChat.audienceType}${googleChat.audience ? ` · ${googleChat.audience}` : ""}`
                : t("channels.na", "n/a")
            }
          </span>
        </div>
        <div>
          <span class="label">${t("channels.lastStart", "Last start")}</span>
          <span>${googleChat?.lastStartAt ? formatRelativeTimestamp(googleChat.lastStartAt) : t("channels.na", "n/a")}</span>
        </div>
        <div>
          <span class="label">${t("channels.lastProbe", "Last probe")}</span>
          <span>${googleChat?.lastProbeAt ? formatRelativeTimestamp(googleChat.lastProbeAt) : t("channels.na", "n/a")}</span>
        </div>
      </div>

      ${
        googleChat?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${googleChat.lastError}
          </div>`
          : nothing
      }

      ${
        googleChat?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t("channels.probe", "Probe")} ${googleChat.probe.ok ? t("channels.probeOk", "ok") : t("channels.probeFailed", "failed")} ·
            ${googleChat.probe.status ?? ""} ${googleChat.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "googlechat", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channels.probe", "Probe")}
        </button>
      </div>
    </div>
  `;
}
