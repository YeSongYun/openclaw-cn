# 为 OpenClaw 做贡献

欢迎来到龙虾池！🦞

## 快速链接

- **GitHub:** https://github.com/openclaw/openclaw
- **Discord:** https://discord.gg/qkhbAGHRBT
- **X/Twitter:** [@steipete](https://x.com/steipete) / [@openclaw](https://x.com/openclaw)

## 维护者

- **Peter Steinberger** - 仁慈的独裁者
  - GitHub: [@steipete](https://github.com/steipete) · X: [@steipete](https://x.com/steipete)

- **Shadow** - Discord + Slack 子系统
  - GitHub: [@thewilloftheshadow](https://github.com/thewilloftheshadow) · X: [@4shad0wed](https://x.com/4shad0wed)

- **Vignesh** - 记忆（QMD）、形式化建模、TUI 和 Lobster
  - GitHub: [@vignesh07](https://github.com/vignesh07) · X: [@\_vgnsh](https://x.com/_vgnsh)

- **Jos** - Telegram、API、Nix 模式
  - GitHub: [@joshp123](https://github.com/joshp123) · X: [@jjpcodes](https://x.com/jjpcodes)

- **Christoph Nakazawa** - JS 基础设施
  - GitHub: [@cpojer](https://github.com/cpojer) · X: [@cnakazawa](https://x.com/cnakazawa)

- **Gustavo Madeira Santana** - 多智能体、CLI、Web UI
  - GitHub: [@gumadeiras](https://github.com/gumadeiras) · X: [@gumadeiras](https://x.com/gumadeiras)

- **Maximilian Nussbaumer** - DevOps、CI、代码质量
  - GitHub: [@quotentiroler](https://github.com/quotentiroler) · X: [@quotentiroler](https://x.com/quotentiroler)

## 如何贡献

1. **Bug 修复和小改动** → 直接提交 PR！
2. **新功能 / 架构变更** → 先发起 [GitHub Discussion](https://github.com/openclaw/openclaw/discussions) 或在 Discord 中讨论
3. **问题咨询** → Discord #setup-help

## 提交 PR 前须知

- 在你的 OpenClaw 实例上进行本地测试
- 运行测试：`pnpm build && pnpm check && pnpm test`
- 确保 CI 检查全部通过
- 保持 PR 聚焦（每个 PR 只做一件事）
- 描述清楚改了什么以及为什么

## Control UI 装饰器

Control UI 使用 Lit 框架，并采用**旧式**装饰器（当前 Rollup 解析不支持标准装饰器所需的 `accessor` 字段）。添加响应式字段时，请保持旧式风格：

```ts
@state() foo = "bar";
@property({ type: Number }) count = 0;
```

根目录的 `tsconfig.json` 已配置为旧式装饰器（`experimentalDecorators: true`），并设置了 `useDefineForClassFields: false`。除非你同时更新 UI 构建工具以支持标准装饰器，否则不要修改这些设置。

## 欢迎 AI/Vibe-Coded PR！🤖

使用 Codex、Claude 或其他 AI 工具构建的？**太棒了——只需标注即可！**

请在你的 PR 中包含：

- [ ] 在 PR 标题或描述中标注为 AI 辅助
- [ ] 说明测试程度（未测试 / 轻度测试 / 完整测试）
- [ ] 如有可能，附上提示词或会话日志（非常有帮助！）
- [ ] 确认你理解代码的功能

AI PR 在这里是一等公民。我们只是希望保持透明，以便审阅者知道需要关注什么。

## 当前重点与路线图 🗺

我们目前优先关注：

- **稳定性**：修复渠道连接中的边缘情况（WhatsApp/Telegram）。
- **用户体验**：改进引导向导和错误提示。
- **技能扩展**：如需贡献技能，请前往 [ClawHub](https://clawhub.ai/) — OpenClaw 技能的社区中心。
- **性能优化**：优化 token 使用和压缩逻辑。

查看 [GitHub Issues](https://github.com/openclaw/openclaw/issues) 中带有 "good first issue" 标签的议题！

## 报告漏洞

我们非常重视安全报告。请直接向问题所在的仓库报告漏洞：

- **核心 CLI 和网关** — [openclaw/openclaw](https://github.com/openclaw/openclaw)
- **macOS 桌面应用** — [openclaw/openclaw](https://github.com/openclaw/openclaw) (apps/macos)
- **iOS 应用** — [openclaw/openclaw](https://github.com/openclaw/openclaw) (apps/ios)
- **Android 应用** — [openclaw/openclaw](https://github.com/openclaw/openclaw) (apps/android)
- **ClawHub** — [openclaw/clawhub](https://github.com/openclaw/clawhub)
- **信任与威胁模型** — [openclaw/trust](https://github.com/openclaw/trust)

对于不适合特定仓库的问题，或如果你不确定，请发邮件至 **security@openclaw.ai**，我们会进行转发处理。

### 报告必须包含

1. **标题**
2. **严重性评估**
3. **影响范围**
4. **受影响组件**
5. **技术复现步骤**
6. **影响演示**
7. **环境信息**
8. **修复建议**

缺少复现步骤、影响演示和修复建议的报告将被降低优先级。鉴于 AI 生成的扫描结果数量众多，我们必须确保收到的是来自理解问题的研究人员的经过验证的报告。
