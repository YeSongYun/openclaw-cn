import { html, nothing } from "lit";
import type { WhatsAppStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp, formatDurationHuman } from "../format.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderWhatsAppCard(params: {
  props: ChannelsProps;
  whatsapp?: WhatsAppStatus;
  accountCountLabel: unknown;
}) {
  const { props, whatsapp, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">WhatsApp</div>
      <div class="card-sub">${t("channels.whatsapp.sub", "Link WhatsApp Web and monitor connection health.")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channels.configured", "Configured")}</span>
          <span>${whatsapp?.configured ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
        </div>
        <div>
          <span class="label">${t("channels.whatsapp.linked", "Linked")}</span>
          <span>${whatsapp?.linked ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
        </div>
        <div>
          <span class="label">${t("channels.running", "Running")}</span>
          <span>${whatsapp?.running ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
        </div>
        <div>
          <span class="label">${t("channels.connected", "Connected")}</span>
          <span>${whatsapp?.connected ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
        </div>
        <div>
          <span class="label">${t("channels.whatsapp.lastConnect", "Last connect")}</span>
          <span>
            ${whatsapp?.lastConnectedAt ? formatRelativeTimestamp(whatsapp.lastConnectedAt) : t("channels.na", "n/a")}
          </span>
        </div>
        <div>
          <span class="label">${t("channels.whatsapp.lastMessage", "Last message")}</span>
          <span>
            ${whatsapp?.lastMessageAt ? formatRelativeTimestamp(whatsapp.lastMessageAt) : t("channels.na", "n/a")}
          </span>
        </div>
        <div>
          <span class="label">${t("channels.whatsapp.authAge", "Auth age")}</span>
          <span>
            ${whatsapp?.authAgeMs != null ? formatDurationHuman(whatsapp.authAgeMs) : t("channels.na", "n/a")}
          </span>
        </div>
      </div>

      ${
        whatsapp?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${whatsapp.lastError}
          </div>`
          : nothing
      }

      ${
        props.whatsappMessage
          ? html`<div class="callout" style="margin-top: 12px;">
            ${props.whatsappMessage}
          </div>`
          : nothing
      }

      ${
        props.whatsappQrDataUrl
          ? html`<div class="qr-wrap">
            <img src=${props.whatsappQrDataUrl} alt="${t("channels.whatsapp.qrAlt", "WhatsApp QR")}" />
          </div>`
          : nothing
      }

      <div class="row" style="margin-top: 14px; flex-wrap: wrap;">
        <button
          class="btn primary"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppStart(false)}
        >
          ${props.whatsappBusy ? t("channels.whatsapp.working", "Working…") : t("channels.whatsapp.showQr", "Show QR")}
        </button>
        <button
          class="btn"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppStart(true)}
        >
          ${t("channels.whatsapp.relink", "Relink")}
        </button>
        <button
          class="btn"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppWait()}
        >
          ${t("channels.whatsapp.waitForScan", "Wait for scan")}
        </button>
        <button
          class="btn danger"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppLogout()}
        >
          ${t("channels.whatsapp.logout", "Logout")}
        </button>
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channels.refresh", "Refresh")}
        </button>
      </div>

      ${renderChannelConfigSection({ channelId: "whatsapp", props })}
    </div>
  `;
}
