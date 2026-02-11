import type { RuntimeEnv, WizardPrompter } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import type { CoreConfig } from "./types.js";
import { ircOnboardingAdapter } from "./onboarding.js";

describe("irc onboarding", () => {
  it("configures host and nick via onboarding prompts", async () => {
    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select: vi.fn(async () => "allowlist"),
      multiselect: vi.fn(async () => []),
      text: vi.fn(async ({ message }: { message: string }) => {
        if (message === "IRC 服务器主机") {
          return "irc.libera.chat";
        }
        if (message === "IRC 服务器端口") {
          return "6697";
        }
        if (message === "IRC 昵称") {
          return "openclaw-bot";
        }
        if (message === "IRC 用户名") {
          return "openclaw";
        }
        if (message === "IRC 真实姓名") {
          return "OpenClaw Bot";
        }
        if (message.startsWith("自动加入的 IRC 频道")) {
          return "#openclaw, #ops";
        }
        if (message.includes("白名单")) {
          return "#openclaw, #ops";
        }
        throw new Error(`Unexpected prompt: ${message}`);
      }) as WizardPrompter["text"],
      confirm: vi.fn(async ({ message }: { message: string }) => {
        if (message === "IRC 是否使用 TLS？") {
          return true;
        }
        if (message.includes("IRC channels") && message.includes("访问权限")) {
          return true;
        }
        return false;
      }),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn(),
    };

    const result = await ircOnboardingAdapter.configure({
      cfg: {} as CoreConfig,
      runtime,
      prompter,
      options: {},
      accountOverrides: {},
      shouldPromptAccountIds: false,
      forceAllowFrom: false,
    });

    expect(result.accountId).toBe("default");
    expect(result.cfg.channels?.irc?.enabled).toBe(true);
    expect(result.cfg.channels?.irc?.host).toBe("irc.libera.chat");
    expect(result.cfg.channels?.irc?.nick).toBe("openclaw-bot");
    expect(result.cfg.channels?.irc?.tls).toBe(true);
    expect(result.cfg.channels?.irc?.channels).toEqual(["#openclaw", "#ops"]);
    expect(result.cfg.channels?.irc?.groupPolicy).toBe("allowlist");
    expect(Object.keys(result.cfg.channels?.irc?.groups ?? {})).toEqual(["#openclaw", "#ops"]);
  });

  it("writes DM allowFrom to top-level config for non-default account prompts", async () => {
    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select: vi.fn(async () => "allowlist"),
      multiselect: vi.fn(async () => []),
      text: vi.fn(async ({ message }: { message: string }) => {
        if (message === "IRC 白名单（昵称或 nick!user@host）") {
          return "Alice, Bob!ident@example.org";
        }
        throw new Error(`Unexpected prompt: ${message}`);
      }) as WizardPrompter["text"],
      confirm: vi.fn(async () => false),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const promptAllowFrom = ircOnboardingAdapter.dmPolicy?.promptAllowFrom;
    expect(promptAllowFrom).toBeTypeOf("function");

    const cfg: CoreConfig = {
      channels: {
        irc: {
          accounts: {
            work: {
              host: "irc.libera.chat",
              nick: "openclaw-work",
            },
          },
        },
      },
    };

    const updated = (await promptAllowFrom?.({
      cfg,
      prompter,
      accountId: "work",
    })) as CoreConfig;

    expect(updated.channels?.irc?.allowFrom).toEqual(["alice", "bob!ident@example.org"]);
    expect(updated.channels?.irc?.accounts?.work?.allowFrom).toBeUndefined();
  });
});
