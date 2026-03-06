import type { OAuthCredentials } from "@mariozechner/pi-ai";
import { loginOpenAICodex } from "@mariozechner/pi-ai";
import { ta } from "../i18n/index.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { createVpsAwareOAuthHandlers } from "./oauth-flow.js";
import {
  formatOpenAIOAuthTlsPreflightFix,
  runOpenAIOAuthTlsPreflight,
} from "./oauth-tls-preflight.js";

export async function loginOpenAICodexOAuth(params: {
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  isRemote: boolean;
  openUrl: (url: string) => Promise<void>;
  localBrowserMessage?: string;
}): Promise<OAuthCredentials | null> {
  const { prompter, runtime, isRemote, openUrl, localBrowserMessage } = params;
  const preflight = await runOpenAIOAuthTlsPreflight();
  if (!preflight.ok && preflight.kind === "tls-cert") {
    const hint = formatOpenAIOAuthTlsPreflightFix(preflight);
    runtime.error(hint);
    await prompter.note(hint, ta("apply.oauth.openai.prerequisites", "OAuth prerequisites"));
    throw new Error(preflight.message);
  }

  await prompter.note(
    isRemote
      ? ta(
          "apply.oauth.openai.remoteNote",
          "You are running in a remote/VPS environment.\nA URL will be shown for you to open in your LOCAL browser.\nAfter signing in, paste the redirect URL back here.",
        )
      : ta(
          "apply.oauth.openai.localNote",
          "Browser will open for OpenAI authentication.\nIf the callback doesn't auto-complete, paste the redirect URL.\nOpenAI OAuth uses localhost:1455 for the callback.",
        ),
    ta("apply.oauth.openai.title", "OpenAI Codex OAuth"),
  );

  const spin = prompter.progress(ta("apply.oauth.openai.startFlow", "Starting OAuth flow…"));
  try {
    const { onAuth, onPrompt } = createVpsAwareOAuthHandlers({
      isRemote,
      prompter,
      runtime,
      spin,
      openUrl,
      localBrowserMessage:
        localBrowserMessage ??
        ta("apply.oauth.openai.localBrowser", "Complete sign-in in browser…"),
    });

    const creds = await loginOpenAICodex({
      onAuth,
      onPrompt,
      onProgress: (msg) => spin.update(msg),
    });
    spin.stop(ta("apply.oauth.openai.complete", "OpenAI OAuth complete"));
    return creds ?? null;
  } catch (err) {
    spin.stop(ta("apply.oauth.openai.failed", "OpenAI OAuth failed"));
    runtime.error(String(err));
    await prompter.note(
      ta(
        "apply.oauth.openai.helpNote",
        "Trouble with OAuth? See https://docs.openclaw.ai/start/faq",
      ),
      ta("apply.oauth.openai.helpTitle", "OAuth help"),
    );
    throw err;
  }
}
