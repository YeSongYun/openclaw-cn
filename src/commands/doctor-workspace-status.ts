import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { buildWorkspaceSkillStatus } from "../agents/skills-status.js";
import type { OpenClawConfig } from "../config/config.js";
import { td, tdi } from "../i18n/index.js";
import { loadOpenClawPlugins } from "../plugins/loader.js";
import { note } from "../terminal/note.js";
import { detectLegacyWorkspaceDirs, formatLegacyWorkspaceWarning } from "./doctor-workspace.js";

export function noteWorkspaceStatus(cfg: OpenClawConfig) {
  const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
  const legacyWorkspace = detectLegacyWorkspaceDirs({ workspaceDir });
  if (legacyWorkspace.legacyDirs.length > 0) {
    note(formatLegacyWorkspaceWarning(legacyWorkspace), "Extra workspace");
  }

  const skillsReport = buildWorkspaceSkillStatus(workspaceDir, { config: cfg });
  note(
    [
      tdi("workspace.status.eligible", "Eligible: {count}", {
        count: skillsReport.skills.filter((s) => s.eligible).length,
      }),
      tdi("workspace.status.missing", "Missing requirements: {count}", {
        count: skillsReport.skills.filter(
          (s) => !s.eligible && !s.disabled && !s.blockedByAllowlist,
        ).length,
      }),
      tdi("workspace.status.blocked", "Blocked by allowlist: {count}", {
        count: skillsReport.skills.filter((s) => s.blockedByAllowlist).length,
      }),
    ].join("\n"),
    td("workspace.status.title", "Skills status"),
  );

  const pluginRegistry = loadOpenClawPlugins({
    config: cfg,
    workspaceDir,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  });
  if (pluginRegistry.plugins.length > 0) {
    const loaded = pluginRegistry.plugins.filter((p) => p.status === "loaded");
    const disabled = pluginRegistry.plugins.filter((p) => p.status === "disabled");
    const errored = pluginRegistry.plugins.filter((p) => p.status === "error");

    const lines = [
      tdi("workspace.plugins.loaded", "Loaded: {count}", { count: loaded.length }),
      tdi("workspace.plugins.disabled", "Disabled: {count}", { count: disabled.length }),
      tdi("workspace.plugins.errors", "Errors: {count}", { count: errored.length }),
      errored.length > 0
        ? `- ${errored
            .slice(0, 10)
            .map((p) => p.id)
            .join("\n- ")}${errored.length > 10 ? "\n- ..." : ""}`
        : null,
    ].filter((line): line is string => Boolean(line));

    note(lines.join("\n"), td("workspace.plugins.title", "Plugins"));
  }
  if (pluginRegistry.diagnostics.length > 0) {
    const lines = pluginRegistry.diagnostics.map((diag) => {
      const prefix = diag.level.toUpperCase();
      const plugin = diag.pluginId ? ` ${diag.pluginId}` : "";
      const source = diag.source ? ` (${diag.source})` : "";
      return `- ${prefix}${plugin}: ${diag.message}${source}`;
    });
    note(lines.join("\n"), td("workspace.plugins.diagnostics", "Plugin diagnostics"));
  }

  return { workspaceDir };
}
