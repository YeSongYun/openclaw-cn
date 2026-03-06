import {
  confirm as clackConfirm,
  intro as clackIntro,
  outro as clackOutro,
  select as clackSelect,
  text as clackText,
} from "@clack/prompts";
import { tcfg } from "../i18n/index.js";
import { stylePromptHint, stylePromptMessage, stylePromptTitle } from "../terminal/prompt-style.js";

export const CONFIGURE_WIZARD_SECTIONS = [
  "workspace",
  "model",
  "web",
  "gateway",
  "daemon",
  "channels",
  "skills",
  "health",
] as const;

export type WizardSection = (typeof CONFIGURE_WIZARD_SECTIONS)[number];

export function parseConfigureWizardSections(raw: unknown): {
  sections: WizardSection[];
  invalid: string[];
} {
  const sectionsRaw: string[] = Array.isArray(raw)
    ? raw.map((value: unknown) => (typeof value === "string" ? value.trim() : "")).filter(Boolean)
    : [];
  if (sectionsRaw.length === 0) {
    return { sections: [], invalid: [] };
  }

  const invalid = sectionsRaw.filter((s) => !CONFIGURE_WIZARD_SECTIONS.includes(s as never));
  const sections = sectionsRaw.filter((s): s is WizardSection =>
    CONFIGURE_WIZARD_SECTIONS.includes(s as never),
  );
  return { sections, invalid };
}

export type ChannelsWizardMode = "configure" | "remove";

export type ConfigureWizardParams = {
  command: "configure" | "update";
  sections?: WizardSection[];
};

export const CONFIGURE_SECTION_OPTIONS: Array<{
  value: WizardSection;
  label: string;
  hint: string;
}> = [
  {
    value: "workspace",
    label: tcfg("shared.workspace.label", "Workspace"),
    hint: tcfg("shared.workspace.hint", "Set workspace + sessions"),
  },
  {
    value: "model",
    label: tcfg("shared.model.label", "Model"),
    hint: tcfg("shared.model.hint", "Pick provider + credentials"),
  },
  {
    value: "web",
    label: tcfg("shared.web.label", "Web tools"),
    hint: tcfg("shared.web.hint", "Configure Brave search + fetch"),
  },
  {
    value: "gateway",
    label: tcfg("shared.gateway.label", "Gateway"),
    hint: tcfg("shared.gateway.hint", "Port, bind, auth, tailscale"),
  },
  {
    value: "daemon",
    label: tcfg("shared.daemon.label", "Daemon"),
    hint: tcfg("shared.daemon.hint", "Install/manage the background service"),
  },
  {
    value: "channels",
    label: tcfg("shared.channels.label", "Channels"),
    hint: tcfg("shared.channels.hint", "Link WhatsApp/Telegram/etc and defaults"),
  },
  {
    value: "skills",
    label: tcfg("shared.skills.label", "Skills"),
    hint: tcfg("shared.skills.hint", "Install/enable workspace skills"),
  },
  {
    value: "health",
    label: tcfg("shared.health.label", "Health check"),
    hint: tcfg("shared.health.hint", "Run gateway + channel checks"),
  },
];

export const intro = (message: string) => clackIntro(stylePromptTitle(message) ?? message);
export const outro = (message: string) => clackOutro(stylePromptTitle(message) ?? message);
export const text = (params: Parameters<typeof clackText>[0]) =>
  clackText({
    ...params,
    message: stylePromptMessage(params.message),
  });
export const confirm = (params: Parameters<typeof clackConfirm>[0]) =>
  clackConfirm({
    ...params,
    message: stylePromptMessage(params.message),
  });
export const select = <T>(params: Parameters<typeof clackSelect<T>>[0]) =>
  clackSelect({
    ...params,
    message: stylePromptMessage(params.message),
    options: params.options.map((opt) =>
      opt.hint === undefined ? opt : { ...opt, hint: stylePromptHint(opt.hint) },
    ),
  });
