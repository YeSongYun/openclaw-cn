import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { formatCliCommand } from "../cli/command-format.js";
import { buildWorkspaceHookStatus } from "../hooks/hooks-status.js";
import { t, ti } from "../i18n/index.js";

export async function setupInternalHooks(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  await prompter.note(
    [
      t(
        "wizard",
        "hooks.description",
        "Hooks let you automate actions when agent commands are issued.",
      ),
      t("wizard", "hooks.example", "Example: Save session context to memory when you issue /new."),
      "",
      "Learn more: https://docs.openclaw.ai/hooks",
    ].join("\n"),
    t("wizard", "hooks.title", "Hooks"),
  );

  // Discover available hooks using the hook discovery system
  const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
  const report = buildWorkspaceHookStatus(workspaceDir, { config: cfg });

  // Show every eligible hook so users can opt in during onboarding.
  const eligibleHooks = report.hooks.filter((h) => h.eligible);

  if (eligibleHooks.length === 0) {
    await prompter.note(
      t(
        "wizard",
        "hooks.noEligible",
        "No eligible hooks found. You can configure hooks later in your config.",
      ),
      t("wizard", "hooks.noEligibleTitle", "No Hooks Available"),
    );
    return cfg;
  }

  const toEnable = await prompter.multiselect({
    message: t("wizard", "hooks.enableHooks", "Enable hooks?"),
    options: [
      { value: "__skip__", label: t("wizard", "hooks.skipForNow", "Skip for now") },
      ...eligibleHooks.map((hook) => ({
        value: hook.name,
        label: `${hook.emoji ?? "🔗"} ${hook.name}`,
        hint: hook.description,
      })),
    ],
  });

  const selected = toEnable.filter((name) => name !== "__skip__");
  if (selected.length === 0) {
    return cfg;
  }

  // Enable selected hooks using the new entries config format
  const entries = { ...cfg.hooks?.internal?.entries };
  for (const name of selected) {
    entries[name] = { enabled: true };
  }

  const next: OpenClawConfig = {
    ...cfg,
    hooks: {
      ...cfg.hooks,
      internal: {
        enabled: true,
        entries,
      },
    },
  };

  await prompter.note(
    [
      ti(
        "wizard",
        "hooks.enabledCount",
        `Enabled ${selected.length} hook${selected.length > 1 ? "s" : ""}: ${selected.join(", ")}`,
        { count: String(selected.length), names: selected.join(", ") },
      ),
      "",
      t("wizard", "hooks.manageLater", "You can manage hooks later with:"),
      `  ${formatCliCommand("openclaw hooks list")}`,
      `  ${formatCliCommand("openclaw hooks enable <name>")}`,
      `  ${formatCliCommand("openclaw hooks disable <name>")}`,
    ].join("\n"),
    t("wizard", "hooks.configured", "Hooks Configured"),
  );

  return next;
}
