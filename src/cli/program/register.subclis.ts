import type { Command } from "commander";
import type { OpenClawConfig } from "../../config/config.js";
import { t } from "../../i18n/index.js";
import { isTruthyEnvValue } from "../../infra/env.js";
import { buildParseArgv, getPrimaryCommand, hasHelpOrVersion } from "../argv.js";
import { resolveActionArgs } from "./helpers.js";

type SubCliRegistrar = (program: Command) => Promise<void> | void;

type SubCliEntry = {
  name: string;
  description: string;
  register: SubCliRegistrar;
};

const shouldRegisterPrimaryOnly = (argv: string[]) => {
  if (isTruthyEnvValue(process.env.OPENCLAW_DISABLE_LAZY_SUBCOMMANDS)) {
    return false;
  }
  if (hasHelpOrVersion(argv)) {
    return false;
  }
  return true;
};

const shouldEagerRegisterSubcommands = (_argv: string[]) => {
  return isTruthyEnvValue(process.env.OPENCLAW_DISABLE_LAZY_SUBCOMMANDS);
};

const loadConfig = async (): Promise<OpenClawConfig> => {
  const mod = await import("../../config/config.js");
  return mod.loadConfig();
};

const entries: SubCliEntry[] = [
  {
    name: "acp",
    description: t("cli", "cmd.acp", "Agent Control Protocol tools"),
    register: async (program) => {
      const mod = await import("../acp-cli.js");
      mod.registerAcpCli(program);
    },
  },
  {
    name: "gateway",
    description: t("cli", "cmd.gateway", "Gateway control"),
    register: async (program) => {
      const mod = await import("../gateway-cli.js");
      mod.registerGatewayCli(program);
    },
  },
  {
    name: "daemon",
    description: t("cli", "cmd.daemon", "Gateway service (legacy alias)"),
    register: async (program) => {
      const mod = await import("../daemon-cli.js");
      mod.registerDaemonCli(program);
    },
  },
  {
    name: "logs",
    description: t("cli", "cmd.logs", "Gateway logs"),
    register: async (program) => {
      const mod = await import("../logs-cli.js");
      mod.registerLogsCli(program);
    },
  },
  {
    name: "system",
    description: t("cli", "cmd.system", "System events, heartbeat, and presence"),
    register: async (program) => {
      const mod = await import("../system-cli.js");
      mod.registerSystemCli(program);
    },
  },
  {
    name: "models",
    description: t("cli", "cmd.models", "Model configuration"),
    register: async (program) => {
      const mod = await import("../models-cli.js");
      mod.registerModelsCli(program);
    },
  },
  {
    name: "approvals",
    description: t("cli", "cmd.approvals", "Exec approvals"),
    register: async (program) => {
      const mod = await import("../exec-approvals-cli.js");
      mod.registerExecApprovalsCli(program);
    },
  },
  {
    name: "nodes",
    description: t("cli", "cmd.nodes", "Node commands"),
    register: async (program) => {
      const mod = await import("../nodes-cli.js");
      mod.registerNodesCli(program);
    },
  },
  {
    name: "devices",
    description: t("cli", "cmd.devices", "Device pairing + token management"),
    register: async (program) => {
      const mod = await import("../devices-cli.js");
      mod.registerDevicesCli(program);
    },
  },
  {
    name: "node",
    description: t("cli", "cmd.node", "Node control"),
    register: async (program) => {
      const mod = await import("../node-cli.js");
      mod.registerNodeCli(program);
    },
  },
  {
    name: "sandbox",
    description: t("cli", "cmd.sandbox", "Sandbox tools"),
    register: async (program) => {
      const mod = await import("../sandbox-cli.js");
      mod.registerSandboxCli(program);
    },
  },
  {
    name: "tui",
    description: t("cli", "cmd.tui", "Terminal UI"),
    register: async (program) => {
      const mod = await import("../tui-cli.js");
      mod.registerTuiCli(program);
    },
  },
  {
    name: "cron",
    description: t("cli", "cmd.cron", "Cron scheduler"),
    register: async (program) => {
      const mod = await import("../cron-cli.js");
      mod.registerCronCli(program);
    },
  },
  {
    name: "dns",
    description: t("cli", "cmd.dns", "DNS helpers"),
    register: async (program) => {
      const mod = await import("../dns-cli.js");
      mod.registerDnsCli(program);
    },
  },
  {
    name: "docs",
    description: t("cli", "cmd.docs", "Docs helpers"),
    register: async (program) => {
      const mod = await import("../docs-cli.js");
      mod.registerDocsCli(program);
    },
  },
  {
    name: "hooks",
    description: t("cli", "cmd.hooks", "Hooks tooling"),
    register: async (program) => {
      const mod = await import("../hooks-cli.js");
      mod.registerHooksCli(program);
    },
  },
  {
    name: "webhooks",
    description: t("cli", "cmd.webhooks", "Webhook helpers"),
    register: async (program) => {
      const mod = await import("../webhooks-cli.js");
      mod.registerWebhooksCli(program);
    },
  },
  {
    name: "pairing",
    description: t("cli", "cmd.pairing", "Pairing helpers"),
    register: async (program) => {
      // Initialize plugins before registering pairing CLI.
      // The pairing CLI calls listPairingChannels() at registration time,
      // which requires the plugin registry to be populated with channel plugins.
      const { registerPluginCliCommands } = await import("../../plugins/cli.js");
      registerPluginCliCommands(program, await loadConfig());
      const mod = await import("../pairing-cli.js");
      mod.registerPairingCli(program);
    },
  },
  {
    name: "plugins",
    description: t("cli", "cmd.plugins", "Plugin management"),
    register: async (program) => {
      const mod = await import("../plugins-cli.js");
      mod.registerPluginsCli(program);
      const { registerPluginCliCommands } = await import("../../plugins/cli.js");
      registerPluginCliCommands(program, await loadConfig());
    },
  },
  {
    name: "channels",
    description: t("cli", "cmd.channels", "Channel management"),
    register: async (program) => {
      const mod = await import("../channels-cli.js");
      mod.registerChannelsCli(program);
    },
  },
  {
    name: "directory",
    description: t("cli", "cmd.directory", "Directory commands"),
    register: async (program) => {
      const mod = await import("../directory-cli.js");
      mod.registerDirectoryCli(program);
    },
  },
  {
    name: "security",
    description: t("cli", "cmd.security", "Security helpers"),
    register: async (program) => {
      const mod = await import("../security-cli.js");
      mod.registerSecurityCli(program);
    },
  },
  {
    name: "skills",
    description: t("cli", "cmd.skills", "Skills management"),
    register: async (program) => {
      const mod = await import("../skills-cli.js");
      mod.registerSkillsCli(program);
    },
  },
  {
    name: "update",
    description: t("cli", "cmd.update", "CLI update helpers"),
    register: async (program) => {
      const mod = await import("../update-cli.js");
      mod.registerUpdateCli(program);
    },
  },
  {
    name: "completion",
    description: t("cli", "cmd.completion", "Generate shell completion script"),
    register: async (program) => {
      const mod = await import("../completion-cli.js");
      mod.registerCompletionCli(program);
    },
  },
];

export function getSubCliEntries(): SubCliEntry[] {
  return entries;
}

function removeCommand(program: Command, command: Command) {
  const commands = program.commands as Command[];
  const index = commands.indexOf(command);
  if (index >= 0) {
    commands.splice(index, 1);
  }
}

export async function registerSubCliByName(program: Command, name: string): Promise<boolean> {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) {
    return false;
  }
  const existing = program.commands.find((cmd) => cmd.name() === entry.name);
  if (existing) {
    removeCommand(program, existing);
  }
  await entry.register(program);
  return true;
}

function registerLazyCommand(program: Command, entry: SubCliEntry) {
  const placeholder = program.command(entry.name).description(entry.description);
  placeholder.allowUnknownOption(true);
  placeholder.allowExcessArguments(true);
  placeholder.action(async (...actionArgs) => {
    removeCommand(program, placeholder);
    await entry.register(program);
    const actionCommand = actionArgs.at(-1) as Command | undefined;
    const root = actionCommand?.parent ?? program;
    const rawArgs = (root as Command & { rawArgs?: string[] }).rawArgs;
    const actionArgsList = resolveActionArgs(actionCommand);
    const fallbackArgv = actionCommand?.name()
      ? [actionCommand.name(), ...actionArgsList]
      : actionArgsList;
    const parseArgv = buildParseArgv({
      programName: program.name(),
      rawArgs,
      fallbackArgv,
    });
    await program.parseAsync(parseArgv);
  });
}

export function registerSubCliCommands(program: Command, argv: string[] = process.argv) {
  if (shouldEagerRegisterSubcommands(argv)) {
    for (const entry of entries) {
      void entry.register(program);
    }
    return;
  }
  const primary = getPrimaryCommand(argv);
  if (primary && shouldRegisterPrimaryOnly(argv)) {
    const entry = entries.find((candidate) => candidate.name === primary);
    if (entry) {
      registerLazyCommand(program, entry);
      return;
    }
  }
  for (const candidate of entries) {
    registerLazyCommand(program, candidate);
  }
}
