import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { ZaloFetch } from "./api.js";
import { resolveZaloAccount } from "./accounts.js";
import { sendMessage, sendPhoto } from "./api.js";
import { resolveZaloProxyFetch } from "./proxy.js";
import { resolveZaloToken } from "./token.js";

export type ZaloSendOptions = {
  token?: string;
  accountId?: string;
  cfg?: OpenClawConfig;
  mediaUrl?: string;
  caption?: string;
  verbose?: boolean;
  proxy?: string;
};

export type ZaloSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

function resolveSendContext(options: ZaloSendOptions): {
  token: string;
  fetcher?: ZaloFetch;
} {
  if (options.cfg) {
    const account = resolveZaloAccount({
      cfg: options.cfg,
      accountId: options.accountId,
    });
    const token = options.token || account.token;
    const proxy = options.proxy ?? account.config.proxy;
    return { token, fetcher: resolveZaloProxyFetch(proxy) };
  }

  const token = options.token ?? resolveZaloToken(undefined, options.accountId).token;
  const proxy = options.proxy;
  return { token, fetcher: resolveZaloProxyFetch(proxy) };
}

export async function sendMessageZalo(
  chatId: string,
  text: string,
  options: ZaloSendOptions = {},
): Promise<ZaloSendResult> {
  const { token, fetcher } = resolveSendContext(options);

  if (!token) {
    return { ok: false, error: "未配置 Zalo 机器人令牌" };
  }

  if (!chatId?.trim()) {
    return { ok: false, error: "未提供 chat_id" };
  }

  if (options.mediaUrl) {
    return sendPhotoZalo(chatId, options.mediaUrl, {
      ...options,
      token,
      caption: text || options.caption,
    });
  }

  try {
    const response = await sendMessage(
      token,
      {
        chat_id: chatId.trim(),
        text: text.slice(0, 2000),
      },
      fetcher,
    );

    if (response.ok && response.result) {
      return { ok: true, messageId: response.result.message_id };
    }

    return { ok: false, error: "发送消息失败" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendPhotoZalo(
  chatId: string,
  photoUrl: string,
  options: ZaloSendOptions = {},
): Promise<ZaloSendResult> {
  const { token, fetcher } = resolveSendContext(options);

  if (!token) {
    return { ok: false, error: "未配置 Zalo 机器人令牌" };
  }

  if (!chatId?.trim()) {
    return { ok: false, error: "未提供 chat_id" };
  }

  if (!photoUrl?.trim()) {
    return { ok: false, error: "未提供图片 URL" };
  }

  try {
    const response = await sendPhoto(
      token,
      {
        chat_id: chatId.trim(),
        photo: photoUrl.trim(),
        caption: options.caption?.slice(0, 2000),
      },
      fetcher,
    );

    if (response.ok && response.result) {
      return { ok: true, messageId: response.result.message_id };
    }

    return { ok: false, error: "发送图片失败" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
