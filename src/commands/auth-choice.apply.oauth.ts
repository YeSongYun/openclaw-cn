import { ta, tai } from "../i18n/index.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { loginChutes } from "./chutes-oauth.js";
import { isRemoteEnvironment } from "./oauth-env.js";
import { createVpsAwareOAuthHandlers } from "./oauth-flow.js";
import { applyAuthProfileConfig, writeOAuthCredentials } from "./onboard-auth.js";
import { openUrl } from "./onboard-helpers.js";

export async function applyAuthChoiceOAuth(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice === "chutes") {
    let nextConfig = params.config;
    const isRemote = isRemoteEnvironment();
    const redirectUri =
      process.env.CHUTES_OAUTH_REDIRECT_URI?.trim() || "http://127.0.0.1:1456/oauth-callback";
    const scopes = process.env.CHUTES_OAUTH_SCOPES?.trim() || "openid profile chutes:invoke";
    const clientId =
      process.env.CHUTES_CLIENT_ID?.trim() ||
      String(
        await params.prompter.text({
          message: ta("apply.oauth.chutes.clientId", "Enter Chutes OAuth client id"),
          placeholder: "cid_xxx",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
    const clientSecret = process.env.CHUTES_CLIENT_SECRET?.trim() || undefined;

    await params.prompter.note(
      isRemote
        ? ta(
            "apply.oauth.chutes.remoteNote",
            "You are running in a remote/VPS environment.\nA URL will be shown for you to open in your LOCAL browser.\nAfter signing in, paste the redirect URL back here.",
          ) + `\n\nRedirect URI: ${redirectUri}`
        : ta(
            "apply.oauth.chutes.localNote",
            "Browser will open for Chutes authentication.\nIf the callback doesn't auto-complete, paste the redirect URL.",
          ) + `\n\nRedirect URI: ${redirectUri}`,
      "Chutes OAuth",
    );

    const spin = params.prompter.progress(
      ta("apply.oauth.chutes.startFlow", "Starting OAuth flow…"),
    );
    try {
      const { onAuth, onPrompt } = createVpsAwareOAuthHandlers({
        isRemote,
        prompter: params.prompter,
        runtime: params.runtime,
        spin,
        openUrl,
        localBrowserMessage: ta("apply.oauth.chutes.localBrowser", "Complete sign-in in browser…"),
      });

      const creds = await loginChutes({
        app: {
          clientId,
          clientSecret,
          redirectUri,
          scopes: scopes.split(/\s+/).filter(Boolean),
        },
        manual: isRemote,
        onAuth,
        onPrompt,
        onProgress: (msg) => spin.update(msg),
      });

      spin.stop(ta("apply.oauth.chutes.complete", "Chutes OAuth complete"));
      const profileId = await writeOAuthCredentials("chutes", creds, params.agentDir);
      nextConfig = applyAuthProfileConfig(nextConfig, {
        profileId,
        provider: "chutes",
        mode: "oauth",
      });
    } catch (err) {
      spin.stop(ta("apply.oauth.chutes.failed", "Chutes OAuth failed"));
      params.runtime.error(String(err));
      await params.prompter.note(
        tai(
          "apply.oauth.chutes.helpNote",
          `Trouble with OAuth?\nVerify CHUTES_CLIENT_ID (and CHUTES_CLIENT_SECRET if required).\nVerify the OAuth app redirect URI includes: ${redirectUri}\nChutes docs: https://chutes.ai/docs/sign-in-with-chutes/overview`,
          { redirectUri },
        ),
        ta("apply.oauth.chutes.helpTitle", "OAuth help"),
      );
    }
    return { config: nextConfig };
  }

  return null;
}
