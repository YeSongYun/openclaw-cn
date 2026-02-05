import { resolveControlUiLinks } from "../../commands/onboard-helpers.js";
import {
  resolveGatewayLaunchAgentLabel,
  resolveGatewaySystemdServiceName,
} from "../../daemon/constants.js";
import { renderGatewayServiceCleanupHints } from "../../daemon/inspect.js";
import { resolveGatewayLogPaths } from "../../daemon/launchd.js";
import {
  isSystemdUnavailableDetail,
  renderSystemdUnavailableHints,
} from "../../daemon/systemd-hints.js";
import { t, ti } from "../../i18n/index.js";
import { isWSLEnv } from "../../infra/wsl.js";
import { getResolvedLoggerSettings } from "../../logging.js";
import { defaultRuntime } from "../../runtime.js";
import { colorize, isRich, theme } from "../../terminal/theme.js";
import { shortenHomePath } from "../../utils.js";
import { formatCliCommand } from "../command-format.js";
import {
  filterDaemonEnv,
  formatRuntimeStatus,
  renderRuntimeHints,
  safeDaemonEnv,
} from "./shared.js";
import {
  type DaemonStatus,
  renderPortDiagnosticsForCli,
  resolvePortListeningAddresses,
} from "./status.gather.js";

function sanitizeDaemonStatusForJson(status: DaemonStatus): DaemonStatus {
  const command = status.service.command;
  if (!command?.environment) {
    return status;
  }
  const safeEnv = filterDaemonEnv(command.environment);
  const nextCommand = {
    ...command,
    environment: Object.keys(safeEnv).length > 0 ? safeEnv : undefined,
  };
  return {
    ...status,
    service: {
      ...status.service,
      command: nextCommand,
    },
  };
}

export function printDaemonStatus(status: DaemonStatus, opts: { json: boolean }) {
  if (opts.json) {
    const sanitized = sanitizeDaemonStatusForJson(status);
    defaultRuntime.log(JSON.stringify(sanitized, null, 2));
    return;
  }

  const rich = isRich();
  const label = (value: string) => colorize(rich, theme.muted, value);
  const accent = (value: string) => colorize(rich, theme.accent, value);
  const infoText = (value: string) => colorize(rich, theme.info, value);
  const okText = (value: string) => colorize(rich, theme.success, value);
  const warnText = (value: string) => colorize(rich, theme.warn, value);
  const errorText = (value: string) => colorize(rich, theme.error, value);
  const spacer = () => defaultRuntime.log("");

  const { service, rpc, extraServices } = status;
  const serviceStatus = service.loaded
    ? okText(service.loadedText)
    : warnText(service.notLoadedText);
  defaultRuntime.log(
    `${label(t("cli", "status.service", "Service:"))} ${accent(service.label)} (${serviceStatus})`,
  );
  try {
    const logFile = getResolvedLoggerSettings().file;
    defaultRuntime.log(
      `${label(t("cli", "status.fileLogs", "File logs:"))} ${infoText(shortenHomePath(logFile))}`,
    );
  } catch {
    // ignore missing config/log resolution
  }
  if (service.command?.programArguments?.length) {
    defaultRuntime.log(
      `${label(t("cli", "status.command", "Command:"))} ${infoText(service.command.programArguments.join(" "))}`,
    );
  }
  if (service.command?.sourcePath) {
    defaultRuntime.log(
      `${label(t("cli", "status.serviceFile", "Service file:"))} ${infoText(shortenHomePath(service.command.sourcePath))}`,
    );
  }
  if (service.command?.workingDirectory) {
    defaultRuntime.log(
      `${label(t("cli", "status.workingDir", "Working dir:"))} ${infoText(shortenHomePath(service.command.workingDirectory))}`,
    );
  }
  const daemonEnvLines = safeDaemonEnv(service.command?.environment);
  if (daemonEnvLines.length > 0) {
    defaultRuntime.log(
      `${label(t("cli", "status.serviceEnv", "Service env:"))} ${daemonEnvLines.join(" ")}`,
    );
  }
  spacer();

  if (service.configAudit?.issues.length) {
    defaultRuntime.error(
      warnText(
        t(
          "cli",
          "status.serviceConfigOutdated",
          "Service config looks out of date or non-standard.",
        ),
      ),
    );
    for (const issue of service.configAudit.issues) {
      const detail = issue.detail ? ` (${issue.detail})` : "";
      defaultRuntime.error(
        `${warnText(t("cli", "status.serviceConfigIssueLabel", "Service config issue:"))} ${issue.message}${detail}`,
      );
    }
    defaultRuntime.error(
      warnText(
        `${t("cli", "status.recommendation", "Recommendation: run")} "${formatCliCommand("openclaw doctor")}" (or "${formatCliCommand("openclaw doctor --repair")}").`,
      ),
    );
  }

  if (status.config) {
    const cliCfg = `${shortenHomePath(status.config.cli.path)}${status.config.cli.exists ? "" : ` (${t("cli", "status.missing", "missing")})`}${status.config.cli.valid ? "" : ` (${t("cli", "status.invalid", "invalid")})`}`;
    defaultRuntime.log(
      `${label(t("cli", "status.configCli", "Config (cli):"))} ${infoText(cliCfg)}`,
    );
    if (!status.config.cli.valid && status.config.cli.issues?.length) {
      for (const issue of status.config.cli.issues.slice(0, 5)) {
        defaultRuntime.error(
          `${errorText(t("cli", "status.configIssue", "Config issue:"))} ${issue.path || "<root>"}: ${issue.message}`,
        );
      }
    }
    if (status.config.daemon) {
      const daemonCfg = `${shortenHomePath(status.config.daemon.path)}${status.config.daemon.exists ? "" : ` (${t("cli", "status.missing", "missing")})`}${status.config.daemon.valid ? "" : ` (${t("cli", "status.invalid", "invalid")})`}`;
      defaultRuntime.log(
        `${label(t("cli", "status.configService", "Config (service):"))} ${infoText(daemonCfg)}`,
      );
      if (!status.config.daemon.valid && status.config.daemon.issues?.length) {
        for (const issue of status.config.daemon.issues.slice(0, 5)) {
          defaultRuntime.error(
            `${errorText(t("cli", "status.serviceConfigIssue", "Service config issue:"))} ${issue.path || "<root>"}: ${issue.message}`,
          );
        }
      }
    }
    if (status.config.mismatch) {
      defaultRuntime.error(
        errorText(
          t(
            "cli",
            "status.configMismatchCause",
            "Root cause: CLI and service are using different config paths (likely a profile/state-dir mismatch).",
          ),
        ),
      );
      defaultRuntime.error(
        errorText(
          `${t("cli", "status.configMismatchFix", "Fix: rerun")} \`${formatCliCommand("openclaw gateway install --force")}\` from the same --profile / OPENCLAW_STATE_DIR you expect.`,
        ),
      );
    }
    spacer();
  }

  if (status.gateway) {
    const bindHost = status.gateway.bindHost ?? "n/a";
    defaultRuntime.log(
      `${label(t("cli", "status.gateway", "Gateway:"))} bind=${infoText(status.gateway.bindMode)} (${infoText(bindHost)}), port=${infoText(String(status.gateway.port))} (${infoText(status.gateway.portSource)})`,
    );
    defaultRuntime.log(
      `${label(t("cli", "status.probeTarget", "Probe target:"))} ${infoText(status.gateway.probeUrl)}`,
    );
    const controlUiEnabled = status.config?.daemon?.controlUi?.enabled ?? true;
    if (!controlUiEnabled) {
      defaultRuntime.log(
        `${label(t("cli", "status.dashboard", "Dashboard:"))} ${warnText(t("cli", "status.disabled", "disabled"))}`,
      );
    } else {
      const links = resolveControlUiLinks({
        port: status.gateway.port,
        bind: status.gateway.bindMode,
        customBindHost: status.gateway.customBindHost,
        basePath: status.config?.daemon?.controlUi?.basePath,
      });
      defaultRuntime.log(
        `${label(t("cli", "status.dashboard", "Dashboard:"))} ${infoText(links.httpUrl)}`,
      );
    }
    if (status.gateway.probeNote) {
      defaultRuntime.log(
        `${label(t("cli", "status.probeNote", "Probe note:"))} ${infoText(status.gateway.probeNote)}`,
      );
    }
    spacer();
  }

  const runtimeLine = formatRuntimeStatus(service.runtime);
  if (runtimeLine) {
    const runtimeStatus = service.runtime?.status ?? "unknown";
    const runtimeColor =
      runtimeStatus === "running"
        ? theme.success
        : runtimeStatus === "stopped"
          ? theme.error
          : runtimeStatus === "unknown"
            ? theme.muted
            : theme.warn;
    defaultRuntime.log(
      `${label(t("cli", "status.runtime", "Runtime:"))} ${colorize(rich, runtimeColor, runtimeLine)}`,
    );
  }

  if (rpc && !rpc.ok && service.loaded && service.runtime?.status === "running") {
    defaultRuntime.log(
      warnText(
        t(
          "cli",
          "status.warmUp",
          "Warm-up: launch agents can take a few seconds. Try again shortly.",
        ),
      ),
    );
  }
  if (rpc) {
    if (rpc.ok) {
      defaultRuntime.log(
        `${label(t("cli", "status.rpcProbe", "RPC probe:"))} ${okText(t("cli", "status.ok", "ok"))}`,
      );
    } else {
      defaultRuntime.error(
        `${label(t("cli", "status.rpcProbe", "RPC probe:"))} ${errorText(t("cli", "status.failed", "failed"))}`,
      );
      if (rpc.url) {
        defaultRuntime.error(`${label(t("cli", "status.rpcTarget", "RPC target:"))} ${rpc.url}`);
      }
      const lines = String(rpc.error ?? "unknown")
        .split(/\r?\n/)
        .filter(Boolean);
      for (const line of lines.slice(0, 12)) {
        defaultRuntime.error(`  ${errorText(line)}`);
      }
    }
    spacer();
  }

  const systemdUnavailable =
    process.platform === "linux" && isSystemdUnavailableDetail(service.runtime?.detail);
  if (systemdUnavailable) {
    defaultRuntime.error(
      errorText(t("cli", "status.systemdUnavailable", "systemd user services unavailable.")),
    );
    for (const hint of renderSystemdUnavailableHints({ wsl: isWSLEnv() })) {
      defaultRuntime.error(errorText(hint));
    }
    spacer();
  }

  if (service.runtime?.missingUnit) {
    defaultRuntime.error(
      errorText(t("cli", "status.serviceUnitNotFound", "Service unit not found.")),
    );
    for (const hint of renderRuntimeHints(service.runtime)) {
      defaultRuntime.error(errorText(hint));
    }
  } else if (service.loaded && service.runtime?.status === "stopped") {
    defaultRuntime.error(
      errorText(
        t(
          "cli",
          "status.serviceLoadedNotRunning",
          "Service is loaded but not running (likely exited immediately).",
        ),
      ),
    );
    for (const hint of renderRuntimeHints(
      service.runtime,
      (service.command?.environment ?? process.env) as NodeJS.ProcessEnv,
    )) {
      defaultRuntime.error(errorText(hint));
    }
    spacer();
  }

  if (service.runtime?.cachedLabel) {
    const env = (service.command?.environment ?? process.env) as NodeJS.ProcessEnv;
    const labelValue = resolveGatewayLaunchAgentLabel(env.OPENCLAW_PROFILE);
    defaultRuntime.error(
      errorText(
        `LaunchAgent label cached but plist missing. Clear with: launchctl bootout gui/$UID/${labelValue}`,
      ),
    );
    defaultRuntime.error(
      errorText(`Then reinstall: ${formatCliCommand("openclaw gateway install")}`),
    );
    spacer();
  }

  for (const line of renderPortDiagnosticsForCli(status, rpc?.ok)) {
    defaultRuntime.error(errorText(line));
  }

  if (status.port) {
    const addrs = resolvePortListeningAddresses(status);
    if (addrs.length > 0) {
      defaultRuntime.log(
        `${label(t("cli", "status.listening", "Listening:"))} ${infoText(addrs.join(", "))}`,
      );
    }
  }

  if (status.portCli && status.portCli.port !== status.port?.port) {
    defaultRuntime.log(
      `${label(t("cli", "status.note", "Note:"))} CLI config resolves gateway port=${status.portCli.port} (${status.portCli.status}).`,
    );
  }

  if (
    service.loaded &&
    service.runtime?.status === "running" &&
    status.port &&
    status.port.status !== "busy"
  ) {
    defaultRuntime.error(
      errorText(
        ti(
          "cli",
          "status.gatewayPortNotListening",
          "Gateway port {port} is not listening (service appears running).",
          { port: status.port.port },
        ),
      ),
    );
    if (status.lastError) {
      defaultRuntime.error(
        `${errorText(t("cli", "status.lastGatewayError", "Last gateway error:"))} ${status.lastError}`,
      );
    }
    if (process.platform === "linux") {
      const env = (service.command?.environment ?? process.env) as NodeJS.ProcessEnv;
      const unit = resolveGatewaySystemdServiceName(env.OPENCLAW_PROFILE);
      defaultRuntime.error(
        errorText(`Logs: journalctl --user -u ${unit}.service -n 200 --no-pager`),
      );
    } else if (process.platform === "darwin") {
      const logs = resolveGatewayLogPaths(
        (service.command?.environment ?? process.env) as NodeJS.ProcessEnv,
      );
      defaultRuntime.error(
        `${errorText(t("cli", "status.logs", "Logs:"))} ${shortenHomePath(logs.stdoutPath)}`,
      );
      defaultRuntime.error(
        `${errorText(t("cli", "status.errors", "Errors:"))} ${shortenHomePath(logs.stderrPath)}`,
      );
    }
    spacer();
  }

  if (extraServices.length > 0) {
    defaultRuntime.error(
      errorText(
        t("cli", "status.extraDetected", "Other gateway-like services detected (best effort):"),
      ),
    );
    for (const svc of extraServices) {
      defaultRuntime.error(`- ${errorText(svc.label)} (${svc.scope}, ${svc.detail})`);
    }
    for (const hint of renderGatewayServiceCleanupHints()) {
      defaultRuntime.error(`${errorText(t("cli", "status.cleanupHint", "Cleanup hint:"))} ${hint}`);
    }
    spacer();
  }

  if (extraServices.length > 0) {
    defaultRuntime.error(
      errorText(
        t(
          "cli",
          "status.singleGatewayRecommend",
          "Recommendation: run a single gateway per machine for most setups. One gateway supports multiple agents (see docs: /gateway#multiple-gateways-same-host).",
        ),
      ),
    );
    defaultRuntime.error(
      errorText(
        t(
          "cli",
          "status.multiGatewayNote",
          "If you need multiple gateways (e.g., a rescue bot on the same host), isolate ports + config/state (see docs: /gateway#multiple-gateways-same-host).",
        ),
      ),
    );
    spacer();
  }

  defaultRuntime.log(
    `${label(t("cli", "status.troubles", "Troubles:"))} run ${formatCliCommand("openclaw status")}`,
  );
  defaultRuntime.log(
    `${label(t("cli", "status.troubleshooting", "Troubleshooting:"))} https://docs.openclaw.ai/troubleshooting`,
  );
}
