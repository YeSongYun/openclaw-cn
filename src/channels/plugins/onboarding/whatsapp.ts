import path from "node:path";
import { loginWeb } from "../../../channel-web.js";
import { formatCliCommand } from "../../../cli/command-format.js";
import type { OpenClawConfig } from "../../../config/config.js";
import { mergeWhatsAppConfig } from "../../../config/merge-config.js";
import type { DmPolicy } from "../../../config/types.js";
import { tch, tchi } from "../../../i18n/index.js";
import { DEFAULT_ACCOUNT_ID } from "../../../routing/session-key.js";
import type { RuntimeEnv } from "../../../runtime.js";
import { formatDocsLink } from "../../../terminal/links.js";
import { normalizeE164, pathExists } from "../../../utils.js";
import {
  listWhatsAppAccountIds,
  resolveDefaultWhatsAppAccountId,
  resolveWhatsAppAuthDir,
} from "../../../web/accounts.js";
import type { WizardPrompter } from "../../../wizard/prompts.js";
import type { ChannelOnboardingAdapter } from "../onboarding-types.js";
import {
  normalizeAllowFromEntries,
  resolveAccountIdForConfigure,
  resolveOnboardingAccountId,
  splitOnboardingEntries,
} from "./helpers.js";

const channel = "whatsapp" as const;

function setWhatsAppDmPolicy(cfg: OpenClawConfig, dmPolicy: DmPolicy): OpenClawConfig {
  return mergeWhatsAppConfig(cfg, { dmPolicy });
}

function setWhatsAppAllowFrom(cfg: OpenClawConfig, allowFrom?: string[]): OpenClawConfig {
  return mergeWhatsAppConfig(cfg, { allowFrom }, { unsetOnUndefined: ["allowFrom"] });
}

function setWhatsAppSelfChatMode(cfg: OpenClawConfig, selfChatMode: boolean): OpenClawConfig {
  return mergeWhatsAppConfig(cfg, { selfChatMode });
}

async function detectWhatsAppLinked(cfg: OpenClawConfig, accountId: string): Promise<boolean> {
  const { authDir } = resolveWhatsAppAuthDir({ cfg, accountId });
  const credsPath = path.join(authDir, "creds.json");
  return await pathExists(credsPath);
}

async function promptWhatsAppOwnerAllowFrom(params: {
  prompter: WizardPrompter;
  existingAllowFrom: string[];
}): Promise<{ normalized: string; allowFrom: string[] }> {
  const { prompter, existingAllowFrom } = params;

  await prompter.note(
    tch(
      "onboard.whatsapp.ownerNoteBody",
      "We need the sender/owner number so OpenClaw can allowlist you.",
    ),
    tch("onboard.whatsapp.ownerNoteTitle", "WhatsApp number"),
  );
  const entry = await prompter.text({
    message: tch(
      "onboard.whatsapp.ownerPhoneMessage",
      "Your personal WhatsApp number (the phone you will message from)",
    ),
    placeholder: "+15555550123",
    initialValue: existingAllowFrom[0],
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) {
        return tch("onboard.helpers.required", "Required");
      }
      const normalized = normalizeE164(raw);
      if (!normalized) {
        return tchi("onboard.whatsapp.invalidNumber", `Invalid number: ${raw}`, { raw });
      }
      return undefined;
    },
  });

  const normalized = normalizeE164(String(entry).trim());
  if (!normalized) {
    throw new Error(
      tch(
        "onboard.whatsapp.invalidOwnerNumber",
        "Invalid WhatsApp owner number (expected E.164 after validation).",
      ),
    );
  }
  const allowFrom = normalizeAllowFromEntries(
    [...existingAllowFrom.filter((item) => item !== "*"), normalized],
    normalizeE164,
  );
  return { normalized, allowFrom };
}

async function applyWhatsAppOwnerAllowlist(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  existingAllowFrom: string[];
  title: string;
  messageLines: string[];
}): Promise<OpenClawConfig> {
  const { normalized, allowFrom } = await promptWhatsAppOwnerAllowFrom({
    prompter: params.prompter,
    existingAllowFrom: params.existingAllowFrom,
  });
  let next = setWhatsAppSelfChatMode(params.cfg, true);
  next = setWhatsAppDmPolicy(next, "allowlist");
  next = setWhatsAppAllowFrom(next, allowFrom);
  await params.prompter.note(
    [
      ...params.messageLines,
      tchi("onboard.whatsapp.allowFromIncludes", `- allowFrom includes ${normalized}`, {
        normalized,
      }),
    ].join("\n"),
    params.title,
  );
  return next;
}

function parseWhatsAppAllowFromEntries(raw: string): { entries: string[]; invalidEntry?: string } {
  const parts = splitOnboardingEntries(raw);
  if (parts.length === 0) {
    return { entries: [] };
  }
  const entries: string[] = [];
  for (const part of parts) {
    if (part === "*") {
      entries.push("*");
      continue;
    }
    const normalized = normalizeE164(part);
    if (!normalized) {
      return { entries: [], invalidEntry: part };
    }
    entries.push(normalized);
  }
  return { entries: normalizeAllowFromEntries(entries, normalizeE164) };
}

async function promptWhatsAppAllowFrom(
  cfg: OpenClawConfig,
  _runtime: RuntimeEnv,
  prompter: WizardPrompter,
  options?: { forceAllowlist?: boolean },
): Promise<OpenClawConfig> {
  const existingPolicy = cfg.channels?.whatsapp?.dmPolicy ?? "pairing";
  const existingAllowFrom = cfg.channels?.whatsapp?.allowFrom ?? [];
  const existingLabel = existingAllowFrom.length > 0 ? existingAllowFrom.join(", ") : "unset";

  if (options?.forceAllowlist) {
    return await applyWhatsAppOwnerAllowlist({
      cfg,
      prompter,
      existingAllowFrom,
      title: tch("onboard.whatsapp.allowlistTitle", "WhatsApp allowlist"),
      messageLines: [tch("onboard.whatsapp.allowlistEnabled", "Allowlist mode enabled.")],
    });
  }

  await prompter.note(
    [
      tch(
        "onboard.whatsapp.dmAccessNote1",
        "WhatsApp direct chats are gated by `channels.whatsapp.dmPolicy` + `channels.whatsapp.allowFrom`.",
      ),
      tch(
        "onboard.whatsapp.dmAccessNote2",
        "- pairing (default): unknown senders get a pairing code; owner approves",
      ),
      tch("onboard.whatsapp.dmAccessNote3", "- allowlist: unknown senders are blocked"),
      tch(
        "onboard.whatsapp.dmAccessNote4",
        '- open: public inbound DMs (requires allowFrom to include "*")',
      ),
      tch("onboard.whatsapp.dmAccessNote5", "- disabled: ignore WhatsApp DMs"),
      "",
      tchi(
        "onboard.whatsapp.dmAccessCurrent",
        `Current: dmPolicy=${existingPolicy}, allowFrom=${existingLabel}`,
        { policy: existingPolicy, allowFrom: existingLabel },
      ),
      `Docs: ${formatDocsLink("/whatsapp", "whatsapp")}`,
    ].join("\n"),
    tch("onboard.whatsapp.dmAccessTitle", "WhatsApp DM access"),
  );

  const phoneMode = await prompter.select({
    message: tch("onboard.whatsapp.phoneSetupMessage", "WhatsApp phone setup"),
    options: [
      {
        value: "personal",
        label: tch("onboard.whatsapp.phonePersonal", "This is my personal phone number"),
      },
      {
        value: "separate",
        label: tch("onboard.whatsapp.phoneSeparate", "Separate phone just for OpenClaw"),
      },
    ],
  });

  if (phoneMode === "personal") {
    return await applyWhatsAppOwnerAllowlist({
      cfg,
      prompter,
      existingAllowFrom,
      title: tch("onboard.whatsapp.personalPhoneTitle", "WhatsApp personal phone"),
      messageLines: [
        tch("onboard.whatsapp.personalPhoneNote1", "Personal phone mode enabled."),
        tch("onboard.whatsapp.personalPhoneNote2", "- dmPolicy set to allowlist (pairing skipped)"),
      ],
    });
  }

  const policy = (await prompter.select({
    message: tch("onboard.whatsapp.dmPolicyMessage", "WhatsApp DM policy"),
    options: [
      {
        value: "pairing",
        label: tch("onboard.whatsapp.dmPolicyPairing", "Pairing (recommended)"),
      },
      {
        value: "allowlist",
        label: tch("onboard.whatsapp.dmPolicyAllowlist", "Allowlist only (block unknown senders)"),
      },
      { value: "open", label: tch("onboard.whatsapp.dmPolicyOpen", "Open (public inbound DMs)") },
      {
        value: "disabled",
        label: tch("onboard.whatsapp.dmPolicyDisabled", "Disabled (ignore WhatsApp DMs)"),
      },
    ],
  })) as DmPolicy;

  let next = setWhatsAppSelfChatMode(cfg, false);
  next = setWhatsAppDmPolicy(next, policy);
  if (policy === "open") {
    const allowFrom = normalizeAllowFromEntries(["*", ...existingAllowFrom], normalizeE164);
    next = setWhatsAppAllowFrom(next, allowFrom.length > 0 ? allowFrom : ["*"]);
    return next;
  }
  if (policy === "disabled") {
    return next;
  }

  const allowOptions =
    existingAllowFrom.length > 0
      ? ([
          {
            value: "keep",
            label: tch("onboard.whatsapp.allowFromKeep", "Keep current allowFrom"),
          },
          {
            value: "unset",
            label: tch(
              "onboard.whatsapp.allowFromUnsetPairing",
              "Unset allowFrom (use pairing approvals only)",
            ),
          },
          {
            value: "list",
            label: tch("onboard.whatsapp.allowFromSetList", "Set allowFrom to specific numbers"),
          },
        ] as const)
      : ([
          {
            value: "unset",
            label: tch("onboard.whatsapp.allowFromUnsetDefault", "Unset allowFrom (default)"),
          },
          {
            value: "list",
            label: tch("onboard.whatsapp.allowFromSetList", "Set allowFrom to specific numbers"),
          },
        ] as const);

  const mode = await prompter.select({
    message: tch(
      "onboard.whatsapp.allowFromMessage",
      "WhatsApp allowFrom (optional pre-allowlist)",
    ),
    options: allowOptions.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
  });

  if (mode === "keep") {
    // Keep allowFrom as-is.
  } else if (mode === "unset") {
    next = setWhatsAppAllowFrom(next, undefined);
  } else {
    const allowRaw = await prompter.text({
      message: tch(
        "onboard.whatsapp.allowedSendersMessage",
        "Allowed sender numbers (comma-separated, E.164)",
      ),
      placeholder: "+15555550123, +447700900123",
      validate: (value) => {
        const raw = String(value ?? "").trim();
        if (!raw) {
          return tch("onboard.helpers.required", "Required");
        }
        const parsed = parseWhatsAppAllowFromEntries(raw);
        if (parsed.entries.length === 0 && !parsed.invalidEntry) {
          return tch("onboard.helpers.required", "Required");
        }
        if (parsed.invalidEntry) {
          return tchi("onboard.whatsapp.invalidNumber", `Invalid number: ${parsed.invalidEntry}`, {
            raw: parsed.invalidEntry,
          });
        }
        return undefined;
      },
    });

    const parsed = parseWhatsAppAllowFromEntries(String(allowRaw));
    next = setWhatsAppAllowFrom(next, parsed.entries);
  }

  return next;
}

export const whatsappOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg, accountOverrides }) => {
    const defaultAccountId = resolveDefaultWhatsAppAccountId(cfg);
    const accountId = resolveOnboardingAccountId({
      accountId: accountOverrides.whatsapp,
      defaultAccountId,
    });
    const linked = await detectWhatsAppLinked(cfg, accountId);
    const accountLabel = accountId === DEFAULT_ACCOUNT_ID ? "default" : accountId;
    const statusText = linked
      ? tch("onboard.whatsapp.statusLinked", "linked")
      : tch("onboard.whatsapp.statusNotLinked", "not linked");
    return {
      channel,
      configured: linked,
      statusLines: [
        tchi("onboard.whatsapp.statusLine", `WhatsApp (${accountLabel}): ${statusText}`, {
          accountLabel,
          status: statusText,
        }),
      ],
      selectionHint: statusText,
      quickstartScore: linked ? 5 : 4,
    };
  },
  configure: async ({
    cfg,
    runtime,
    prompter,
    options,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const accountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "WhatsApp",
      accountOverride: accountOverrides.whatsapp,
      shouldPromptAccountIds: Boolean(shouldPromptAccountIds || options?.promptWhatsAppAccountId),
      listAccountIds: listWhatsAppAccountIds,
      defaultAccountId: resolveDefaultWhatsAppAccountId(cfg),
    });

    let next = cfg;
    if (accountId !== DEFAULT_ACCOUNT_ID) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          whatsapp: {
            ...next.channels?.whatsapp,
            accounts: {
              ...next.channels?.whatsapp?.accounts,
              [accountId]: {
                ...next.channels?.whatsapp?.accounts?.[accountId],
                enabled: next.channels?.whatsapp?.accounts?.[accountId]?.enabled ?? true,
              },
            },
          },
        },
      };
    }

    const linked = await detectWhatsAppLinked(next, accountId);
    const { authDir } = resolveWhatsAppAuthDir({
      cfg: next,
      accountId,
    });

    if (!linked) {
      await prompter.note(
        [
          tch("onboard.whatsapp.linkingNote1", "Scan the QR with WhatsApp on your phone."),
          tchi(
            "onboard.whatsapp.linkingNote2",
            `Credentials are stored under ${authDir}/ for future runs.`,
            { authDir },
          ),
          `Docs: ${formatDocsLink("/whatsapp", "whatsapp")}`,
        ].join("\n"),
        tch("onboard.whatsapp.linkingTitle", "WhatsApp linking"),
      );
    }
    const wantsLink = await prompter.confirm({
      message: linked
        ? tch("onboard.whatsapp.relinkMessage", "WhatsApp already linked. Re-link now?")
        : tch("onboard.whatsapp.linkMessage", "Link WhatsApp now (QR)?"),
      initialValue: !linked,
    });
    if (wantsLink) {
      try {
        await loginWeb(false, undefined, runtime, accountId);
      } catch (err) {
        runtime.error(
          tchi("onboard.whatsapp.loginFailed", `WhatsApp login failed: ${String(err)}`, {
            error: String(err),
          }),
        );
        await prompter.note(
          `Docs: ${formatDocsLink("/whatsapp", "whatsapp")}`,
          tch("onboard.whatsapp.helpTitle", "WhatsApp help"),
        );
      }
    } else if (!linked) {
      await prompter.note(
        tchi(
          "onboard.whatsapp.linkLaterNote",
          `Run \`${formatCliCommand("openclaw channels login")}\` later to link WhatsApp.`,
          { command: formatCliCommand("openclaw channels login") },
        ),
        tch("onboard.whatsapp.linkLaterTitle", "WhatsApp"),
      );
    }

    next = await promptWhatsAppAllowFrom(next, runtime, prompter, {
      forceAllowlist: forceAllowFrom,
    });

    return { cfg: next, accountId };
  },
  onAccountRecorded: (accountId, options) => {
    options?.onWhatsAppAccountId?.(accountId);
  },
};
