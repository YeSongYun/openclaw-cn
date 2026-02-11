import { getMe, ZaloApiError, type ZaloBotInfo, type ZaloFetch } from "./api.js";

export type ZaloProbeResult = {
  ok: boolean;
  bot?: ZaloBotInfo;
  error?: string;
  elapsedMs: number;
};

export async function probeZalo(
  token: string,
  timeoutMs = 5000,
  fetcher?: ZaloFetch,
): Promise<ZaloProbeResult> {
  if (!token?.trim()) {
    return { ok: false, error: "未提供令牌", elapsedMs: 0 };
  }

  const startTime = Date.now();

  try {
    const response = await getMe(token.trim(), timeoutMs, fetcher);
    const elapsedMs = Date.now() - startTime;

    if (response.ok && response.result) {
      return { ok: true, bot: response.result, elapsedMs };
    }

    return { ok: false, error: "Zalo API 返回无效响应", elapsedMs };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;

    if (err instanceof ZaloApiError) {
      return { ok: false, error: err.description ?? err.message, elapsedMs };
    }

    if (err instanceof Error) {
      if (err.name === "AbortError") {
        return { ok: false, error: `请求超时（${timeoutMs}ms）`, elapsedMs };
      }
      return { ok: false, error: err.message, elapsedMs };
    }

    return { ok: false, error: String(err), elapsedMs };
  }
}
