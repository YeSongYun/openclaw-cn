import { html, nothing } from "lit";
import type { ChannelAccountSnapshot, TelegramStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderTelegramCard(params: {
  props: ChannelsProps;
  telegram?: TelegramStatus;
  telegramAccounts: ChannelAccountSnapshot[];
  accountCountLabel: unknown;
}) {
  const { props, telegram, telegramAccounts, accountCountLabel } = params;
  const hasMultipleAccounts = telegramAccounts.length > 1;

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const probe = account.probe as { bot?: { username?: string } } | undefined;
    const botUsername = probe?.bot?.username;
    const label = account.name || account.accountId;
    return html`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">
            ${botUsername ? `@${botUsername}` : label}
          </div>
          <div class="account-card-id">${account.accountId}</div>
        </div>
        <div class="status-list account-card-status">
          <div>
            <span class="label">${t("channels.running", "Running")}</span>
            <span>${account.running ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
          </div>
          <div>
            <span class="label">${t("channels.configured", "Configured")}</span>
            <span>${account.configured ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
          </div>
          <div>
            <span class="label">${t("channels.lastInbound", "Last inbound")}</span>
            <span>${account.lastInboundAt ? formatRelativeTimestamp(account.lastInboundAt) : t("channels.na", "n/a")}</span>
          </div>
          ${
            account.lastError
              ? html`
                <div class="account-card-error">
                  ${account.lastError}
                </div>
              `
              : nothing
          }
        </div>
      </div>
    `;
  };

  return html`
    <div class="card">
      <div class="card-title">Telegram</div>
      <div class="card-sub">${t("channels.telegram.sub", "Bot status and channel configuration.")}</div>
      ${accountCountLabel}

      ${
        hasMultipleAccounts
          ? html`
            <div class="account-card-list">
              ${telegramAccounts.map((account) => renderAccountCard(account))}
            </div>
          `
          : html`
            <div class="status-list" style="margin-top: 16px;">
              <div>
                <span class="label">${t("channels.configured", "Configured")}</span>
                <span>${telegram?.configured ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
              </div>
              <div>
                <span class="label">${t("channels.running", "Running")}</span>
                <span>${telegram?.running ? t("channels.yes", "Yes") : t("channels.no", "No")}</span>
              </div>
              <div>
                <span class="label">${t("channels.telegram.mode", "Mode")}</span>
                <span>${telegram?.mode ?? t("channels.na", "n/a")}</span>
              </div>
              <div>
                <span class="label">${t("channels.lastStart", "Last start")}</span>
                <span>${telegram?.lastStartAt ? formatRelativeTimestamp(telegram.lastStartAt) : t("channels.na", "n/a")}</span>
              </div>
              <div>
                <span class="label">${t("channels.lastProbe", "Last probe")}</span>
                <span>${telegram?.lastProbeAt ? formatRelativeTimestamp(telegram.lastProbeAt) : t("channels.na", "n/a")}</span>
              </div>
            </div>
          `
      }

      ${
        telegram?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${telegram.lastError}
          </div>`
          : nothing
      }

      ${
        telegram?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t("channels.probe", "Probe")} ${telegram.probe.ok ? t("channels.probeOk", "ok") : t("channels.probeFailed", "failed")} ·
            ${telegram.probe.status ?? ""} ${telegram.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "telegram", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channels.probe", "Probe")}
        </button>
      </div>
    </div>
  `;
}
