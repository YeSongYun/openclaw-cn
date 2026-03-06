import { toAgentModelListLike } from "../config/model-input.js";
import { ta, tai } from "../i18n/index.js";
import { githubCopilotLoginCommand } from "../providers/github-copilot-auth.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyAuthProfileConfig } from "./onboard-auth.js";

export async function applyAuthChoiceGitHubCopilot(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "github-copilot") {
    return null;
  }

  let nextConfig = params.config;

  await params.prompter.note(
    ta(
      "apply.githubCopilot.note",
      "This will open a GitHub device login to authorize Copilot.\nRequires an active GitHub Copilot subscription.",
    ),
    ta("apply.githubCopilot.title", "GitHub Copilot"),
  );

  if (!process.stdin.isTTY) {
    await params.prompter.note(
      ta("apply.githubCopilot.ttyRequired", "GitHub Copilot login requires an interactive TTY."),
      ta("apply.githubCopilot.title", "GitHub Copilot"),
    );
    return { config: nextConfig };
  }

  try {
    await githubCopilotLoginCommand({ yes: true }, params.runtime);
  } catch (err) {
    await params.prompter.note(
      tai("apply.githubCopilot.loginFailed", `GitHub Copilot login failed: ${String(err)}`, {
        error: String(err),
      }),
      ta("apply.githubCopilot.title", "GitHub Copilot"),
    );
    return { config: nextConfig };
  }

  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId: "github-copilot:github",
    provider: "github-copilot",
    mode: "token",
  });

  if (params.setDefaultModel) {
    const model = "github-copilot/gpt-4o";
    nextConfig = {
      ...nextConfig,
      agents: {
        ...nextConfig.agents,
        defaults: {
          ...nextConfig.agents?.defaults,
          model: {
            ...toAgentModelListLike(nextConfig.agents?.defaults?.model),
            primary: model,
          },
        },
      },
    };
    await params.prompter.note(
      tai("apply.githubCopilot.modelSet", `Default model set to ${model}`, { model }),
      ta("apply.githubCopilot.modelSetTitle", "Model configured"),
    );
  }

  return { config: nextConfig };
}
