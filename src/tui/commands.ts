import type { SlashCommand } from "@mariozechner/pi-tui";
import { listChatCommands, listChatCommandsForConfig } from "../auto-reply/commands-registry.js";
import { formatThinkingLevels, listThinkingLevelLabels } from "../auto-reply/thinking.js";
import type { OpenClawConfig } from "../config/types.js";
import { tt } from "../i18n/index.js";

const VERBOSE_LEVELS = ["on", "off"];
const REASONING_LEVELS = ["on", "off"];
const ELEVATED_LEVELS = ["on", "off", "ask", "full"];
const ACTIVATION_LEVELS = ["mention", "always"];
const USAGE_FOOTER_LEVELS = ["off", "tokens", "full"];

export type ParsedCommand = {
  name: string;
  args: string;
};

export type SlashCommandOptions = {
  cfg?: OpenClawConfig;
  provider?: string;
  model?: string;
};

const COMMAND_ALIASES: Record<string, string> = {
  elev: "elevated",
};

function createLevelCompletion(
  levels: string[],
): NonNullable<SlashCommand["getArgumentCompletions"]> {
  return (prefix) =>
    levels
      .filter((value) => value.startsWith(prefix.toLowerCase()))
      .map((value) => ({
        value,
        label: value,
      }));
}

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.replace(/^\//, "").trim();
  if (!trimmed) {
    return { name: "", args: "" };
  }
  const [name, ...rest] = trimmed.split(/\s+/);
  const normalized = name.toLowerCase();
  return {
    name: COMMAND_ALIASES[normalized] ?? normalized,
    args: rest.join(" ").trim(),
  };
}

export function getSlashCommands(options: SlashCommandOptions = {}): SlashCommand[] {
  const thinkLevels = listThinkingLevelLabels(options.provider, options.model);
  const verboseCompletions = createLevelCompletion(VERBOSE_LEVELS);
  const reasoningCompletions = createLevelCompletion(REASONING_LEVELS);
  const usageCompletions = createLevelCompletion(USAGE_FOOTER_LEVELS);
  const elevatedCompletions = createLevelCompletion(ELEVATED_LEVELS);
  const activationCompletions = createLevelCompletion(ACTIVATION_LEVELS);
  const commands: SlashCommand[] = [
    { name: "help", description: tt("cmd.help", "Show slash command help") },
    { name: "status", description: tt("cmd.status", "Show gateway status summary") },
    { name: "agent", description: tt("cmd.agent", "Switch agent (or open picker)") },
    { name: "agents", description: tt("cmd.agents", "Open agent picker") },
    { name: "session", description: tt("cmd.session", "Switch session (or open picker)") },
    { name: "sessions", description: tt("cmd.sessions", "Open session picker") },
    {
      name: "model",
      description: tt("cmd.model", "Set model (or open picker)"),
    },
    { name: "models", description: tt("cmd.models", "Open model picker") },
    {
      name: "think",
      description: tt("cmd.think", "Set thinking level"),
      getArgumentCompletions: (prefix) =>
        thinkLevels
          .filter((v) => v.startsWith(prefix.toLowerCase()))
          .map((value) => ({ value, label: value })),
    },
    {
      name: "verbose",
      description: tt("cmd.verbose", "Set verbose on/off"),
      getArgumentCompletions: verboseCompletions,
    },
    {
      name: "reasoning",
      description: tt("cmd.reasoning", "Set reasoning on/off"),
      getArgumentCompletions: reasoningCompletions,
    },
    {
      name: "usage",
      description: tt("cmd.usage", "Toggle per-response usage line"),
      getArgumentCompletions: usageCompletions,
    },
    {
      name: "elevated",
      description: tt("cmd.elevated", "Set elevated on/off/ask/full"),
      getArgumentCompletions: elevatedCompletions,
    },
    {
      name: "elev",
      description: tt("cmd.elev", "Alias for /elevated"),
      getArgumentCompletions: elevatedCompletions,
    },
    {
      name: "activation",
      description: tt("cmd.activation", "Set group activation"),
      getArgumentCompletions: activationCompletions,
    },
    { name: "abort", description: tt("cmd.abort", "Abort active run") },
    { name: "new", description: tt("cmd.new", "Reset the session") },
    { name: "reset", description: tt("cmd.reset", "Reset the session") },
    { name: "settings", description: tt("cmd.settings", "Open settings") },
    { name: "exit", description: tt("cmd.exit", "Exit the TUI") },
    { name: "quit", description: tt("cmd.quit", "Exit the TUI") },
  ];

  const seen = new Set(commands.map((command) => command.name));
  const gatewayCommands = options.cfg ? listChatCommandsForConfig(options.cfg) : listChatCommands();
  for (const command of gatewayCommands) {
    const aliases = command.textAliases.length > 0 ? command.textAliases : [`/${command.key}`];
    for (const alias of aliases) {
      const name = alias.replace(/^\//, "").trim();
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      commands.push({ name, description: command.description });
    }
  }

  return commands;
}

export function helpText(options: SlashCommandOptions = {}): string {
  const thinkLevels = formatThinkingLevels(options.provider, options.model, "|");
  return [
    tt("help.title", "Slash commands:"),
    "/help",
    "/commands",
    "/status",
    "/agent <id> (or /agents)",
    "/session <key> (or /sessions)",
    "/model <provider/model> (or /models)",
    `/think <${thinkLevels}>`,
    "/verbose <on|off>",
    "/reasoning <on|off>",
    "/usage <off|tokens|full>",
    "/elevated <on|off|ask|full>",
    "/elev <on|off|ask|full>",
    "/activation <mention|always>",
    "/new or /reset",
    "/abort",
    "/settings",
    "/exit",
  ].join("\n");
}
