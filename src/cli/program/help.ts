import type { Command } from "commander";
import { tc } from "../../i18n/index.js";
import { formatDocsLink } from "../../terminal/links.js";
import { isRich, theme } from "../../terminal/theme.js";
import { escapeRegExp } from "../../utils.js";
import { hasFlag, hasRootVersionAlias } from "../argv.js";
import { formatCliBannerLine, hasEmittedCliBanner } from "../banner.js";
import { replaceCliName, resolveCliName } from "../cli-name.js";
import { CLI_LOG_LEVEL_VALUES, parseCliLogLevelOption } from "../log-level-option.js";
import { getCoreCliCommandsWithSubcommands } from "./command-registry.js";
import type { ProgramContext } from "./context.js";
import { getSubCliCommandsWithSubcommands } from "./register.subclis.js";

const CLI_NAME = resolveCliName();
const CLI_NAME_PATTERN = escapeRegExp(CLI_NAME);
const ROOT_COMMANDS_WITH_SUBCOMMANDS = new Set([
  ...getCoreCliCommandsWithSubcommands(),
  ...getSubCliCommandsWithSubcommands(),
]);

export function configureProgramHelp(program: Command, ctx: ProgramContext) {
  // 移入函数体确保 preloadCommonNamespaces() 已先行运行，翻译文件已缓存
  const rootCommandsHint = tc(
    "help.commandsHint",
    "Hint: commands suffixed with * have subcommands. Run <command> --help for details.",
  );

  const examples: [string, string][] = [
    [
      "openclaw models --help",
      tc("example.modelsHelp", "Show detailed help for the models command."),
    ],
    [
      "openclaw channels login --verbose",
      tc("example.channelsLogin", "Link personal WhatsApp Web and show QR + connection logs."),
    ],
    [
      'openclaw message send --target +15555550123 --message "Hi" --json',
      tc("example.messageSend", "Send via your web session and print JSON result."),
    ],
    [
      "openclaw gateway --port 18789",
      tc("example.gatewayPort", "Run the WebSocket Gateway locally."),
    ],
    [
      "openclaw --dev gateway",
      tc(
        "example.devGateway",
        "Run a dev Gateway (isolated state/config) on ws://127.0.0.1:19001.",
      ),
    ],
    [
      "openclaw gateway --force",
      tc("example.gatewayForce", "Kill anything bound to the default gateway port, then start it."),
    ],
    ["openclaw gateway ...", tc("example.gatewayControl", "Gateway control via WebSocket.")],
    [
      'openclaw agent --to +15555550123 --message "Run summary" --deliver',
      tc(
        "example.agentRun",
        "Talk directly to the agent using the Gateway; optionally send the WhatsApp reply.",
      ),
    ],
    [
      'openclaw message send --channel telegram --target @mychat --message "Hi"',
      tc("example.telegramSend", "Send via your Telegram bot."),
    ],
  ];

  program
    .name(CLI_NAME)
    .description("")
    .version(ctx.programVersion)
    .option(
      "--dev",
      tc(
        "option.dev",
        "Dev profile: isolate state under ~/.openclaw-dev, default gateway port 19001, and shift derived ports (browser/canvas)",
      ),
    )
    .option(
      "--profile <name>",
      tc(
        "option.profile",
        "Use a named profile (isolates OPENCLAW_STATE_DIR/OPENCLAW_CONFIG_PATH under ~/.openclaw-<name>)",
      ),
    )
    .option(
      "--log-level <level>",
      `${tc("option.logLevel", "Global log level override for file + console")} (${CLI_LOG_LEVEL_VALUES})`,
      parseCliLogLevelOption,
    );

  program.option("--no-color", tc("option.noColor", "Disable ANSI colors"), false);
  program.helpOption("-h, --help", tc("option.help", "Display help for command"));
  program.helpCommand("help [command]", tc("cmd.help", "Display help for command"));

  program.configureHelp({
    // sort options and subcommands alphabetically
    sortSubcommands: true,
    sortOptions: true,
    optionTerm: (option) => theme.option(option.flags),
    subcommandTerm: (cmd) => {
      const isRootCommand = cmd.parent === program;
      const hasSubcommands = isRootCommand && ROOT_COMMANDS_WITH_SUBCOMMANDS.has(cmd.name());
      return theme.command(hasSubcommands ? `${cmd.name()} *` : cmd.name());
    },
  });

  const formatHelpOutput = (str: string) => {
    let output = str;
    const isRootHelp = new RegExp(
      `^Usage:\\s+${CLI_NAME_PATTERN}\\s+\\[options\\]\\s+\\[command\\]\\s*$`,
      "m",
    ).test(output);
    // 先插入 hint（匹配英文 "Commands:"，此时标题还未替换），再替换标题为中文
    if (isRootHelp && /^Commands:/m.test(output)) {
      output = output.replace(/^Commands:/m, `Commands:\n  ${theme.muted(rootCommandsHint)}`);
    }

    return output
      .replace(/^Usage:/gm, theme.heading(tc("help.usage", "Usage:")))
      .replace(/^Options:/gm, theme.heading(tc("help.options", "Options:")))
      .replace(/^Commands:/gm, theme.heading(tc("help.commands", "Commands:")));
  };

  program.configureOutput({
    writeOut: (str) => {
      process.stdout.write(formatHelpOutput(str));
    },
    writeErr: (str) => {
      process.stderr.write(formatHelpOutput(str));
    },
    outputError: (str, write) => write(theme.error(str)),
  });

  if (
    hasFlag(process.argv, "-V") ||
    hasFlag(process.argv, "--version") ||
    hasRootVersionAlias(process.argv)
  ) {
    console.log(ctx.programVersion);
    process.exit(0);
  }

  program.addHelpText("beforeAll", () => {
    if (hasEmittedCliBanner()) {
      return "";
    }
    const rich = isRich();
    const line = formatCliBannerLine(ctx.programVersion, { richTty: rich });
    return `\n${line}\n`;
  });

  const fmtExamples = examples
    .map(
      ([cmd, desc]) =>
        `  ${theme.command(replaceCliName(cmd, CLI_NAME))}\n    ${theme.muted(desc)}`,
    )
    .join("\n");

  program.addHelpText("afterAll", ({ command }) => {
    if (command !== program) {
      return "";
    }
    const docs = formatDocsLink("/cli", "docs.openclaw.ai/cli");
    return `\n${theme.heading(tc("help.examples", "Examples:"))}\n${fmtExamples}\n\n${theme.muted(tc("help.docs", "Docs:"))} ${docs}\n`;
  });
}
