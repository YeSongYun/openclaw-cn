import type { ZcaUserInfo } from "./types.js";
import { runZca, parseJsonOutput } from "./zca.js";

export interface ZalouserProbeResult {
  ok: boolean;
  user?: ZcaUserInfo;
  error?: string;
}

export async function probeZalouser(
  profile: string,
  timeoutMs?: number,
): Promise<ZalouserProbeResult> {
  const result = await runZca(["me", "info", "-j"], {
    profile,
    timeout: timeoutMs,
  });

  if (!result.ok) {
    return { ok: false, error: result.stderr || "探测失败" };
  }

  const user = parseJsonOutput<ZcaUserInfo>(result.stdout);
  if (!user) {
    return { ok: false, error: "解析用户信息失败" };
  }
  return { ok: true, user };
}
