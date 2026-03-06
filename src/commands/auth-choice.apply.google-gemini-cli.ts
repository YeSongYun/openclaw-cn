import { ta } from "../i18n/index.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyAuthChoicePluginProvider } from "./auth-choice.apply.plugin-provider.js";

export async function applyAuthChoiceGoogleGeminiCli(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "google-gemini-cli") {
    return null;
  }

  await params.prompter.note(
    ta(
      "apply.geminiCli.cautionNote",
      "This is an unofficial integration and is not endorsed by Google.\nSome users have reported account restrictions or suspensions after using third-party Gemini CLI and Antigravity OAuth clients.\nProceed only if you understand and accept this risk.",
    ),
    ta("apply.geminiCli.cautionTitle", "Google Gemini CLI caution"),
  );

  const proceed = await params.prompter.confirm({
    message: ta("apply.geminiCli.confirmContinue", "Continue with Google Gemini CLI OAuth?"),
    initialValue: false,
  });

  if (!proceed) {
    await params.prompter.note(
      ta("apply.geminiCli.skipped", "Skipped Google Gemini CLI OAuth setup."),
      ta("apply.geminiCli.skippedTitle", "Setup skipped"),
    );
    return { config: params.config };
  }

  return await applyAuthChoicePluginProvider(params, {
    authChoice: "google-gemini-cli",
    pluginId: "google-gemini-cli-auth",
    providerId: "google-gemini-cli",
    methodId: "oauth",
    label: "Google Gemini CLI",
  });
}
