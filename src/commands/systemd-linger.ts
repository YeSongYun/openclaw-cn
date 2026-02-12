import type { RuntimeEnv } from "../runtime.js";
import {
  enableSystemdUserLinger,
  isSystemdUserServiceAvailable,
  readSystemdUserLingerStatus,
} from "../daemon/systemd.js";
import { t, ti } from "../i18n/index.js";
import { note } from "../terminal/note.js";

export type LingerPrompter = {
  confirm?: (params: { message: string; initialValue?: boolean }) => Promise<boolean>;
  note: (message: string, title?: string) => Promise<void> | void;
};

export async function ensureSystemdUserLingerInteractive(params: {
  runtime: RuntimeEnv;
  prompter?: LingerPrompter;
  env?: NodeJS.ProcessEnv;
  title?: string;
  reason?: string;
  prompt?: boolean;
  requireConfirm?: boolean;
}): Promise<void> {
  if (process.platform !== "linux") {
    return;
  }
  if (params.prompt === false) {
    return;
  }
  const env = params.env ?? process.env;
  const prompter = params.prompter ?? { note };
  const title = params.title ?? t("wizard", "systemd.title", "Systemd");
  if (!(await isSystemdUserServiceAvailable())) {
    await prompter.note(
      t(
        "wizard",
        "systemd.unavailable",
        "Systemd user services are unavailable. Skipping lingering checks.",
      ),
      title,
    );
    return;
  }
  const status = await readSystemdUserLingerStatus(env);
  if (!status) {
    await prompter.note(
      t(
        "wizard",
        "systemd.cannotReadStatus",
        "Unable to read loginctl linger status. Ensure systemd + loginctl are available.",
      ),
      title,
    );
    return;
  }
  if (status.linger === "yes") {
    return;
  }

  const reason =
    params.reason ??
    t(
      "wizard",
      "systemd.reason",
      "Systemd user services stop when you log out or go idle, which kills the Gateway.",
    );
  const actionNote = params.requireConfirm
    ? t(
        "wizard",
        "systemd.enableNow",
        "We can enable lingering now (may require sudo; writes /var/lib/systemd/linger).",
      )
    : t(
        "wizard",
        "systemd.enablingNow",
        "Enabling lingering now (may require sudo; writes /var/lib/systemd/linger).",
      );
  await prompter.note(`${reason}\n${actionNote}`, title);

  if (params.requireConfirm && prompter.confirm) {
    const ok = await prompter.confirm({
      message: ti("wizard", "systemd.enableLinger", "Enable systemd lingering for {user}?", {
        user: status.user,
      }),
      initialValue: true,
    });
    if (!ok) {
      await prompter.note(
        t(
          "wizard",
          "systemd.withoutLinger",
          "Without lingering, the Gateway will stop when you log out.",
        ),
        title,
      );
      return;
    }
  }

  const resultNoSudo = await enableSystemdUserLinger({
    env,
    user: status.user,
  });
  if (resultNoSudo.ok) {
    await prompter.note(
      ti("wizard", "systemd.enabled", "Enabled systemd lingering for {user}.", {
        user: status.user,
      }),
      title,
    );
    return;
  }

  const result = await enableSystemdUserLinger({
    env,
    user: status.user,
    sudoMode: "prompt",
  });
  if (result.ok) {
    await prompter.note(
      ti("wizard", "systemd.enabled", "Enabled systemd lingering for {user}.", {
        user: status.user,
      }),
      title,
    );
    return;
  }

  params.runtime.error(
    `Failed to enable lingering: ${result.stderr || result.stdout || "unknown error"}`,
  );
  await prompter.note(
    ti("wizard", "systemd.runManually", "Run manually: sudo loginctl enable-linger {user}", {
      user: status.user,
    }),
    title,
  );
}

export async function ensureSystemdUserLingerNonInteractive(params: {
  runtime: RuntimeEnv;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  if (process.platform !== "linux") {
    return;
  }
  const env = params.env ?? process.env;
  if (!(await isSystemdUserServiceAvailable())) {
    return;
  }
  const status = await readSystemdUserLingerStatus(env);
  if (!status || status.linger === "yes") {
    return;
  }

  const result = await enableSystemdUserLinger({
    env,
    user: status.user,
    sudoMode: "non-interactive",
  });
  if (result.ok) {
    params.runtime.log(
      ti("wizard", "systemd.enabled", "Enabled systemd lingering for {user}.", {
        user: status.user,
      }),
    );
    return;
  }

  params.runtime.log(
    `Systemd lingering is disabled for ${status.user}. Run: sudo loginctl enable-linger ${status.user}`,
  );
}
