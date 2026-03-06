import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../agents/agent-scope.js";
import { ensureAuthProfileStore } from "../agents/auth-profiles.js";
import { resolveAuthStorePath } from "../agents/auth-profiles/paths.js";
import { writeConfigFile } from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import { tag, tagi } from "../i18n/index.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../routing/session-key.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath, shortenHomePath } from "../utils.js";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { WizardCancelledError } from "../wizard/prompts.js";
import {
  applyAgentBindings,
  buildChannelBindings,
  describeBinding,
  parseBindingSpecs,
} from "./agents.bindings.js";
import { createQuietRuntime, requireValidConfig } from "./agents.command-shared.js";
import { applyAgentConfig, findAgentEntryIndex, listAgentEntries } from "./agents.config.js";
import { promptAuthChoiceGrouped } from "./auth-choice-prompt.js";
import { applyAuthChoice, warnIfModelConfigLooksOff } from "./auth-choice.js";
import { setupChannels } from "./onboard-channels.js";
import { ensureWorkspaceAndSessions } from "./onboard-helpers.js";
import type { ChannelChoice } from "./onboard-types.js";

type AgentsAddOptions = {
  name?: string;
  workspace?: string;
  model?: string;
  agentDir?: string;
  bind?: string[];
  nonInteractive?: boolean;
  json?: boolean;
};

async function fileExists(pathname: string): Promise<boolean> {
  try {
    await fs.stat(pathname);
    return true;
  } catch {
    return false;
  }
}

export async function agentsAddCommand(
  opts: AgentsAddOptions,
  runtime: RuntimeEnv = defaultRuntime,
  params?: { hasFlags?: boolean },
) {
  const cfg = await requireValidConfig(runtime);
  if (!cfg) {
    return;
  }

  const workspaceFlag = opts.workspace?.trim();
  const nameInput = opts.name?.trim();
  const hasFlags = params?.hasFlags === true;
  const nonInteractive = Boolean(opts.nonInteractive || hasFlags);

  if (nonInteractive && !workspaceFlag) {
    runtime.error(
      tag(
        "add.nonInteractiveNeedsWorkspace",
        "Non-interactive mode requires --workspace. Re-run without flags to use the wizard.",
      ),
    );
    runtime.exit(1);
    return;
  }

  if (nonInteractive) {
    if (!nameInput) {
      runtime.error(
        tag("add.nonInteractiveNeedsName", "Agent name is required in non-interactive mode."),
      );
      runtime.exit(1);
      return;
    }
    if (!workspaceFlag) {
      runtime.error(
        tag(
          "add.nonInteractiveNeedsWorkspace",
          "Non-interactive mode requires --workspace. Re-run without flags to use the wizard.",
        ),
      );
      runtime.exit(1);
      return;
    }
    const agentId = normalizeAgentId(nameInput);
    if (agentId === DEFAULT_AGENT_ID) {
      runtime.error(
        tagi("add.reservedName", '"{name}" is reserved. Choose another name.', {
          name: DEFAULT_AGENT_ID,
        }),
      );
      runtime.exit(1);
      return;
    }
    if (agentId !== nameInput) {
      runtime.log(tagi("add.normalizedId", 'Normalized agent id to "{agentId}".', { agentId }));
    }
    if (findAgentEntryIndex(listAgentEntries(cfg), agentId) >= 0) {
      runtime.error(tagi("add.alreadyExists", 'Agent "{agentId}" already exists.', { agentId }));
      runtime.exit(1);
      return;
    }

    const workspaceDir = resolveUserPath(workspaceFlag);
    const agentDir = opts.agentDir?.trim()
      ? resolveUserPath(opts.agentDir.trim())
      : resolveAgentDir(cfg, agentId);
    const model = opts.model?.trim();
    const nextConfig = applyAgentConfig(cfg, {
      agentId,
      name: nameInput,
      workspace: workspaceDir,
      agentDir,
      ...(model ? { model } : {}),
    });

    const bindingParse = parseBindingSpecs({
      agentId,
      specs: opts.bind,
      config: nextConfig,
    });
    if (bindingParse.errors.length > 0) {
      runtime.error(bindingParse.errors.join("\n"));
      runtime.exit(1);
      return;
    }
    const bindingResult =
      bindingParse.bindings.length > 0
        ? applyAgentBindings(nextConfig, bindingParse.bindings)
        : { config: nextConfig, added: [], updated: [], skipped: [], conflicts: [] };

    await writeConfigFile(bindingResult.config);
    if (!opts.json) {
      logConfigUpdated(runtime);
    }
    const quietRuntime = opts.json ? createQuietRuntime(runtime) : runtime;
    await ensureWorkspaceAndSessions(workspaceDir, quietRuntime, {
      skipBootstrap: Boolean(bindingResult.config.agents?.defaults?.skipBootstrap),
      agentId,
    });

    const payload = {
      agentId,
      name: nameInput,
      workspace: workspaceDir,
      agentDir,
      model,
      bindings: {
        added: bindingResult.added.map(describeBinding),
        updated: bindingResult.updated.map(describeBinding),
        skipped: bindingResult.skipped.map(describeBinding),
        conflicts: bindingResult.conflicts.map(
          (conflict) => `${describeBinding(conflict.binding)} (agent=${conflict.existingAgentId})`,
        ),
      },
    };
    if (opts.json) {
      runtime.log(JSON.stringify(payload, null, 2));
    } else {
      runtime.log(tagi("add.logAgent", "Agent: {agentId}", { agentId }));
      runtime.log(
        tagi("add.logWorkspace", "Workspace: {workspace}", {
          workspace: shortenHomePath(workspaceDir),
        }),
      );
      runtime.log(
        tagi("add.logAgentDir", "Agent dir: {agentDir}", { agentDir: shortenHomePath(agentDir) }),
      );
      if (model) {
        runtime.log(tagi("add.logModel", "Model: {model}", { model }));
      }
      if (bindingResult.conflicts.length > 0) {
        runtime.error(
          [
            tag("add.skippedBindings", "Skipped bindings already claimed by another agent:"),
            ...bindingResult.conflicts.map(
              (conflict) =>
                `- ${describeBinding(conflict.binding)} (agent=${conflict.existingAgentId})`,
            ),
          ].join("\n"),
        );
      }
    }
    return;
  }

  const prompter = createClackPrompter();
  try {
    await prompter.intro(tag("add.intro", "Add OpenClaw agent"));
    const name =
      nameInput ??
      (await prompter.text({
        message: tag("add.namePrompt", "Agent name"),
        validate: (value) => {
          if (!value?.trim()) {
            return tag("add.required", "Required");
          }
          const normalized = normalizeAgentId(value);
          if (normalized === DEFAULT_AGENT_ID) {
            return tagi("add.reservedName", '"{name}" is reserved. Choose another name.', {
              name: DEFAULT_AGENT_ID,
            });
          }
          return undefined;
        },
      }));

    const agentName = String(name ?? "").trim();
    const agentId = normalizeAgentId(agentName);
    if (agentName !== agentId) {
      await prompter.note(
        tagi("add.normalizedIdNote", 'Normalized id to "{agentId}".', { agentId }),
        tag("add.agentIdTitle", "Agent id"),
      );
    }

    const existingAgent = listAgentEntries(cfg).find(
      (agent) => normalizeAgentId(agent.id) === agentId,
    );
    if (existingAgent) {
      const shouldUpdate = await prompter.confirm({
        message: tagi("add.existsUpdate", 'Agent "{agentId}" already exists. Update it?', {
          agentId,
        }),
        initialValue: false,
      });
      if (!shouldUpdate) {
        await prompter.outro(tag("add.noChanges", "No changes made."));
        return;
      }
    }

    const workspaceDefault = resolveAgentWorkspaceDir(cfg, agentId);
    const workspaceInput = await prompter.text({
      message: tag("add.workspacePrompt", "Workspace directory"),
      initialValue: workspaceDefault,
      validate: (value) => (value?.trim() ? undefined : tag("add.required", "Required")),
    });
    const workspaceDir = resolveUserPath(String(workspaceInput ?? "").trim() || workspaceDefault);
    const agentDir = resolveAgentDir(cfg, agentId);

    let nextConfig = applyAgentConfig(cfg, {
      agentId,
      name: agentName,
      workspace: workspaceDir,
      agentDir,
    });

    const defaultAgentId = resolveDefaultAgentId(cfg);
    if (defaultAgentId !== agentId) {
      const sourceAuthPath = resolveAuthStorePath(resolveAgentDir(cfg, defaultAgentId));
      const destAuthPath = resolveAuthStorePath(agentDir);
      const sameAuthPath =
        path.resolve(sourceAuthPath).toLowerCase() === path.resolve(destAuthPath).toLowerCase();
      if (
        !sameAuthPath &&
        (await fileExists(sourceAuthPath)) &&
        !(await fileExists(destAuthPath))
      ) {
        const shouldCopy = await prompter.confirm({
          message: tagi("add.copyAuth", 'Copy auth profiles from "{defaultAgentId}"?', {
            defaultAgentId,
          }),
          initialValue: false,
        });
        if (shouldCopy) {
          await fs.mkdir(path.dirname(destAuthPath), { recursive: true });
          await fs.copyFile(sourceAuthPath, destAuthPath);
          await prompter.note(
            tagi("add.authCopied", 'Copied auth profiles from "{defaultAgentId}".', {
              defaultAgentId,
            }),
            tag("add.authProfilesTitle", "Auth profiles"),
          );
        }
      }
    }

    const wantsAuth = await prompter.confirm({
      message: tag("add.configureAuth", "Configure model/auth for this agent now?"),
      initialValue: false,
    });
    if (wantsAuth) {
      const authStore = ensureAuthProfileStore(agentDir, {
        allowKeychainPrompt: false,
      });
      const authChoice = await promptAuthChoiceGrouped({
        prompter,
        store: authStore,
        includeSkip: true,
      });

      const authResult = await applyAuthChoice({
        authChoice,
        config: nextConfig,
        prompter,
        runtime,
        agentDir,
        setDefaultModel: false,
        agentId,
      });
      nextConfig = authResult.config;
      if (authResult.agentModelOverride) {
        nextConfig = applyAgentConfig(nextConfig, {
          agentId,
          model: authResult.agentModelOverride,
        });
      }
    }

    await warnIfModelConfigLooksOff(nextConfig, prompter, {
      agentId,
      agentDir,
    });

    let selection: ChannelChoice[] = [];
    const channelAccountIds: Partial<Record<ChannelChoice, string>> = {};
    nextConfig = await setupChannels(nextConfig, runtime, prompter, {
      allowSignalInstall: true,
      onSelection: (value) => {
        selection = value;
      },
      promptAccountIds: true,
      onAccountId: (channel, accountId) => {
        channelAccountIds[channel] = accountId;
      },
    });

    if (selection.length > 0) {
      const wantsBindings = await prompter.confirm({
        message: tag("add.routeChannels", "Route selected channels to this agent now? (bindings)"),
        initialValue: false,
      });
      if (wantsBindings) {
        const desiredBindings = buildChannelBindings({
          agentId,
          selection,
          config: nextConfig,
          accountIds: channelAccountIds,
        });
        const result = applyAgentBindings(nextConfig, desiredBindings);
        nextConfig = result.config;
        if (result.conflicts.length > 0) {
          await prompter.note(
            [
              tag("add.skippedBindings", "Skipped bindings already claimed by another agent:"),
              ...result.conflicts.map(
                (conflict) =>
                  `- ${describeBinding(conflict.binding)} (agent=${conflict.existingAgentId})`,
              ),
            ].join("\n"),
            tag("add.routingBindings", "Routing bindings"),
          );
        }
      } else {
        await prompter.note(
          [
            tag("add.routingUnchanged", "Routing unchanged. Add bindings when you're ready."),
            tag("add.routingDocs", "Docs: https://docs.openclaw.ai/concepts/multi-agent"),
          ].join("\n"),
          tag("add.routingTitle", "Routing"),
        );
      }
    }

    await writeConfigFile(nextConfig);
    logConfigUpdated(runtime);
    await ensureWorkspaceAndSessions(workspaceDir, runtime, {
      skipBootstrap: Boolean(nextConfig.agents?.defaults?.skipBootstrap),
      agentId,
    });

    const payload = {
      agentId,
      name: agentName,
      workspace: workspaceDir,
      agentDir,
    };
    if (opts.json) {
      runtime.log(JSON.stringify(payload, null, 2));
    }
    await prompter.outro(tagi("add.ready", 'Agent "{agentId}" ready.', { agentId }));
  } catch (err) {
    if (err instanceof WizardCancelledError) {
      runtime.exit(1);
      return;
    }
    throw err;
  }
}
