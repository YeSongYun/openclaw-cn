import { t, ti } from "../i18n/index.js";
import { note } from "./note.js";

/**
 * i18n 版本的 note()，支持静态消息
 */
export function noteT(
  ns: string,
  msgKey: string,
  msgFallback: string,
  titleKey?: string,
  titleFallback?: string,
): void {
  const message = t(ns, msgKey, msgFallback);
  const title = titleKey && titleFallback ? t(ns, titleKey, titleFallback) : undefined;
  note(message, title);
}

/**
 * i18n 版本的 note()，支持插值变量（如 {port}、{user}）
 */
export function noteTi(
  ns: string,
  msgKey: string,
  msgFallback: string,
  vars: Record<string, string | number>,
  titleKey?: string,
  titleFallback?: string,
): void {
  const message = ti(ns, msgKey, msgFallback, vars);
  const title = titleKey && titleFallback ? t(ns, titleKey, titleFallback) : undefined;
  note(message, title);
}
