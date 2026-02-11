import type { Command } from "commander";
import type { ProgramContext } from "./context.js";
import { t } from "../../i18n/index.js";
import { formatDocsLink } from "../../terminal/links.js";
import { isRich, theme } from "../../terminal/theme.js";
import { formatCliBannerLine, hasEmittedCliBanner } from "../banner.js";
import { replaceCliName, resolveCliName } from "../cli-name.js";

const CLI_NAME = resolveCliName();

const EXAMPLES = [
  [
    "openclaw channels login --verbose",
    t("cli", "example.channelsLogin", "Link personal WhatsApp Web and show QR + connection logs."),
  ],
  [
    'openclaw message send --target +15555550123 --message "Hi" --json',
    t("cli", "example.messageSend", "Send via your web session and print JSON result."),
  ],
  [
    "openclaw gateway --port 18789",
    t("cli", "example.gatewayPort", "Run the WebSocket Gateway locally."),
  ],
  [
    "openclaw --dev gateway",
    t(
      "cli",
      "example.devGateway",
      "Run a dev Gateway (isolated state/config) on ws://127.0.0.1:19001.",
    ),
  ],
  [
    "openclaw gateway --force",
    t(
      "cli",
      "example.gatewayForce",
      "Kill anything bound to the default gateway port, then start it.",
    ),
  ],
  ["openclaw gateway ...", t("cli", "example.gatewayControl", "Gateway control via WebSocket.")],
  [
    'openclaw agent --to +15555550123 --message "Run summary" --deliver',
    t(
      "cli",
      "example.agentRun",
      "Talk directly to the agent using the Gateway; optionally send the WhatsApp reply.",
    ),
  ],
  [
    'openclaw message send --channel telegram --target @mychat --message "Hi"',
    t("cli", "example.telegramSend", "Send via your Telegram bot."),
  ],
] as const;

export function configureProgramHelp(program: Command, ctx: ProgramContext) {
  program
    .name(CLI_NAME)
    .description("")
    .version(ctx.programVersion)
    .option(
      "--dev",
      t(
        "cli",
        "option.dev",
        "Dev profile: isolate state under ~/.openclaw-dev, default gateway port 19001, and shift derived ports (browser/canvas)",
      ),
    )
    .option(
      "--profile <name>",
      t(
        "cli",
        "option.profile",
        "Use a named profile (isolates OPENCLAW_STATE_DIR/OPENCLAW_CONFIG_PATH under ~/.openclaw-<name>)",
      ),
    );

  program.option("--no-color", t("cli", "option.noColor", "Disable ANSI colors"), false);

  program.configureHelp({
    // sort options and subcommands alphabetically
    sortSubcommands: true,
    sortOptions: true,
    optionTerm: (option) => theme.option(option.flags),
    subcommandTerm: (cmd) => theme.command(cmd.name()),
  });

  program.configureOutput({
    writeOut: (str) => {
      const colored = str
        .replace(/^Usage:/gm, theme.heading(t("cli", "help.usage", "Usage:")))
        .replace(/^Options:/gm, theme.heading(t("cli", "help.options", "Options:")))
        .replace(/^Commands:/gm, theme.heading(t("cli", "help.commands", "Commands:")));
      process.stdout.write(colored);
    },
    writeErr: (str) => process.stderr.write(str),
    outputError: (str, write) => write(theme.error(str)),
  });

  if (
    process.argv.includes("-V") ||
    process.argv.includes("--version") ||
    process.argv.includes("-v")
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

  const fmtExamples = EXAMPLES.map(
    ([cmd, desc]) => `  ${theme.command(replaceCliName(cmd, CLI_NAME))}\n    ${theme.muted(desc)}`,
  ).join("\n");

  program.addHelpText("afterAll", ({ command }) => {
    if (command !== program) {
      return "";
    }
    const docs = formatDocsLink("/cli", "docs.openclaw.ai/cli");
    return `\n${theme.heading(t("cli", "help.examples", "Examples:"))}\n${fmtExamples}\n\n${theme.muted(t("cli", "help.docs", "Docs:"))} ${docs}\n`;
  });
}
