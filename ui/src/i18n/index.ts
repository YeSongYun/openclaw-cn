/**
 * Web UI 国际化模块
 * 浏览器端翻译支持
 */

type TranslationData = Record<string, string>;

let translations: TranslationData = {};
let currentLocale = "zh-CN";

/**
 * 初始化翻译数据
 */
export async function initI18n(locale?: string): Promise<void> {
  currentLocale = locale ?? detectLocale();
  try {
    const basePath =
      ((window as unknown as Record<string, unknown>).__OPENCLAW_CONTROL_UI_BASE_PATH__ as
        | string
        | undefined) ?? "";
    const response = await fetch(`${basePath}/locales/${currentLocale}/ui.json`);
    if (response.ok) {
      translations = await response.json();
    }
  } catch {
    translations = {};
  }
}

/**
 * 检测语言：优先使用后端注入的 locale
 */
function detectLocale(): string {
  const injected = (window as unknown as Record<string, unknown>).__OPENCLAW_LOCALE__;
  if (typeof injected === "string" && injected) {
    return injected;
  }
  const lang = navigator.language || "en";
  if (lang.startsWith("zh")) {
    return "zh-CN";
  }
  return "en";
}

/**
 * 获取当前语言
 */
export function getLocale(): string {
  return currentLocale;
}

/**
 * 获取翻译字符串
 */
export function t(key: string, fallback: string): string {
  return translations[key] ?? fallback;
}

/**
 * 获取带插值的翻译字符串
 */
export function ti(key: string, fallback: string, vars: Record<string, string | number>): string {
  let result = t(key, fallback);
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return result;
}
