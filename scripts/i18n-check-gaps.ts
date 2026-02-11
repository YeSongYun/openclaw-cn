#!/usr/bin/env node
/**
 * 翻译缺口检测脚本
 * 扫描源代码中的翻译调用，检查是否有遗漏的翻译键
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

// 翻译文件目录
const localesDir = path.join(rootDir, "locales", "zh-CN");

// 源代码目录
const srcDirs = [path.join(rootDir, "src"), path.join(rootDir, "ui", "src")];

// 翻译调用模式
const translationPatterns = [
  /\bt\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,/g, // t("ns", "key", "fallback")
  /\bti\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,/g, // ti("ns", "key", "fallback", vars)
  /\btr\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/g, // tr("key", "fallback")
  /\btri\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,/g, // tri("key", "fallback", vars)
];

interface TranslationCall {
  namespace: string;
  key: string;
  fallback: string;
  file: string;
  line: number;
}

interface TranslationGap {
  namespace: string;
  key: string;
  fallback: string;
  files: string[];
}

function loadTranslations(): Record<string, Record<string, string>> {
  const translations: Record<string, Record<string, string>> = {};

  if (!fs.existsSync(localesDir)) {
    console.log(`翻译目录不存在: ${localesDir}`);
    return translations;
  }

  const files = fs.readdirSync(localesDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const namespace = path.basename(file, ".json");
    const filePath = path.join(localesDir, file);
    try {
      translations[namespace] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
      console.error(`解析翻译文件失败: ${filePath}`, e);
    }
  }

  return translations;
}

function scanSourceFiles(): TranslationCall[] {
  const calls: TranslationCall[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== "dist") {
          scanDir(fullPath);
        }
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        scanFile(fullPath);
      }
    }
  }

  function scanFile(filePath: string) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of translationPatterns) {
        pattern.lastIndex = 0;
        let match;

        while ((match = pattern.exec(line)) !== null) {
          // 判断是 t/ti 还是 tr/tri
          const isReplyHelper = pattern.source.includes("\\btr");

          if (isReplyHelper) {
            // tr/tri: 第一个参数是 key，命名空间固定为 replies
            calls.push({
              namespace: "replies",
              key: match[1],
              fallback: match[2],
              file: path.relative(rootDir, filePath),
              line: i + 1,
            });
          } else {
            // t/ti: 第一个参数是命名空间，第二个是 key
            calls.push({
              namespace: match[1],
              key: match[2],
              fallback: match[3] || "",
              file: path.relative(rootDir, filePath),
              line: i + 1,
            });
          }
        }
      }
    }
  }

  for (const dir of srcDirs) {
    scanDir(dir);
  }

  return calls;
}

function findGaps(
  calls: TranslationCall[],
  translations: Record<string, Record<string, string>>,
): TranslationGap[] {
  const gaps: Map<string, TranslationGap> = new Map();

  for (const call of calls) {
    const nsTranslations = translations[call.namespace] ?? {};

    if (!(call.key in nsTranslations)) {
      const gapKey = `${call.namespace}:${call.key}`;
      const existing = gaps.get(gapKey);

      if (existing) {
        if (!existing.files.includes(call.file)) {
          existing.files.push(call.file);
        }
      } else {
        gaps.set(gapKey, {
          namespace: call.namespace,
          key: call.key,
          fallback: call.fallback,
          files: [call.file],
        });
      }
    }
  }

  return Array.from(gaps.values());
}

function main() {
  console.log("🔍 扫描翻译缺口...\n");

  const translations = loadTranslations();
  const namespaces = Object.keys(translations);
  console.log(`📚 已加载翻译命名空间: ${namespaces.join(", ") || "(无)"}\n`);

  const calls = scanSourceFiles();
  console.log(`📝 发现 ${calls.length} 个翻译调用\n`);

  const gaps = findGaps(calls, translations);

  if (gaps.length === 0) {
    console.log("✅ 没有发现翻译缺口！所有翻译键都已定义。\n");
    return;
  }

  console.log(`⚠️  发现 ${gaps.length} 个翻译缺口:\n`);

  // 按命名空间分组
  const byNamespace: Record<string, TranslationGap[]> = {};
  for (const gap of gaps) {
    if (!byNamespace[gap.namespace]) {
      byNamespace[gap.namespace] = [];
    }
    byNamespace[gap.namespace].push(gap);
  }

  for (const [ns, nsGaps] of Object.entries(byNamespace)) {
    console.log(`\n📁 ${ns}.json (${nsGaps.length} 个缺口):`);
    console.log("─".repeat(50));

    for (const gap of nsGaps) {
      console.log(`  "${gap.key}": "${gap.fallback}",`);
      console.log(`    └─ 使用于: ${gap.files.join(", ")}`);
    }
  }

  console.log("\n");
  console.log("💡 提示: 将上述键添加到对应的翻译文件中。");
}

main();
