/**
 * 国际化核心模块
 * 提供翻译加载和字符串替换功能
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type TranslationData = Record<string, string>;
const cache: Record<string, TranslationData> = {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 获取当前语言环境
 */
export function getLocale(): string {
  return process.env.CLAWDBOT_LOCALE ?? "zh-CN";
}

/**
 * 加载指定命名空间的翻译数据
 */
function loadNamespace(ns: string): TranslationData {
  const locale = getLocale();
  const cacheKey = `${locale}:${ns}`;
  if (cache[cacheKey]) return cache[cacheKey];

  // 优先尝试 dist 扁平结构路径 (../locales)，再尝试 src 嵌套结构路径 (../../locales)
  const candidates = [
    path.join(__dirname, "../locales", locale, `${ns}.json`),
    path.join(__dirname, "../../locales", locale, `${ns}.json`),
  ];
  for (const filePath of candidates) {
    try {
      cache[cacheKey] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return cache[cacheKey];
    } catch {
      // 尝试下一个路径
    }
  }
  cache[cacheKey] = {};
  return cache[cacheKey];
}

/**
 * 获取翻译字符串
 * @param ns 命名空间（对应 locales/zh-CN/ 下的 JSON 文件名）
 * @param key 翻译键
 * @param fallback 回退文本（通常是英文原文）
 */
export function t(ns: string, key: string, fallback: string): string {
  return loadNamespace(ns)[key] ?? fallback;
}

/**
 * 获取带插值的翻译字符串
 * @param ns 命名空间
 * @param key 翻译键
 * @param fallback 回退文本
 * @param vars 插值变量 { name: "value" } 会替换 {name}
 */
export function ti(
  ns: string,
  key: string,
  fallback: string,
  vars: Record<string, string | number>,
): string {
  let result = t(ns, key, fallback);
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return result;
}

/**
 * 清除翻译缓存（用于测试或热重载）
 */
export function clearTranslationCache(): void {
  for (const key of Object.keys(cache)) {
    delete cache[key];
  }
}
