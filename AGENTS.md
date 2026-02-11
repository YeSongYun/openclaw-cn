# 仓库指南

- 仓库：https://github.com/openclaw/openclaw
- GitHub issues/评论/PR 评论：使用字面多行字符串或 `-F - <<'EOF'`（或 `$'...'`）来实现真正的换行；不要嵌入 "\\n"。

## 项目结构与模块组织

- 源代码：`src/`（CLI 接入在 `src/cli`，命令在 `src/commands`，Web Provider 在 `src/provider-web.ts`，基础设施在 `src/infra`，媒体管线在 `src/media`）。
- 测试：与源代码同目录放置，命名为 `*.test.ts`。
- 文档：`docs/`（图片、队列、Pi 配置）。构建产物位于 `dist/`。
- 插件/扩展：位于 `extensions/*`（workspace 包）。插件专用依赖放在扩展的 `package.json` 中；除非核心使用，否则不要添加到根 `package.json`。
- 插件：安装时运行 `npm install --omit=dev`；运行时依赖必须放在 `dependencies` 中。避免在 `dependencies` 中使用 `workspace:*`（npm install 会出错）；将 `openclaw` 放在 `devDependencies` 或 `peerDependencies` 中（运行时通过 jiti 别名解析 `openclaw/plugin-sdk`）。
- 安装脚本从 `https://openclaw.ai/*` 提供：位于兄弟仓库 `../openclaw.ai`（`public/install.sh`、`public/install-cli.sh`、`public/install.ps1`）。
- 消息渠道：重构共享逻辑（路由、白名单、配对、命令门控、引导、文档）时，始终考虑**所有**内置 + 扩展渠道。
  - 核心渠道文档：`docs/channels/`
  - 核心渠道代码：`src/telegram`、`src/discord`、`src/slack`、`src/signal`、`src/imessage`、`src/web`（WhatsApp web）、`src/channels`、`src/routing`
  - 扩展（渠道插件）：`extensions/*`（例如 `extensions/msteams`、`extensions/matrix`、`extensions/zalo`、`extensions/zalouser`、`extensions/voice-call`）
- 添加渠道/扩展/应用/文档时，更新 `.github/labeler.yml` 并创建匹配的 GitHub 标签（使用现有渠道/扩展标签的颜色）。

## 文档链接（Mintlify）

- 文档托管在 Mintlify（docs.openclaw.ai）。
- `docs/**/*.md` 中的内部文档链接：根相对路径，不带 `.md`/`.mdx`（示例：`[Config](/configuration)`）。
- 章节交叉引用：在根相对路径上使用锚点（示例：`[Hooks](/configuration#hooks)`）。
- 文档标题和锚点：避免在标题中使用破折号和撇号，因为它们会破坏 Mintlify 的锚点链接。
- 当 Peter 请求链接时，回复完整的 `https://docs.openclaw.ai/...` URL（不是根相对路径）。
- 当你修改文档时，在回复末尾附上你引用的 `https://docs.openclaw.ai/...` URL。
- README（GitHub）：保持使用绝对文档 URL（`https://docs.openclaw.ai/...`），以便链接在 GitHub 上正常工作。
- 文档内容必须通用：不要出现个人设备名称/主机名/路径；使用占位符如 `user@gateway-host` 和 "gateway host"。

## 文档国际化（zh-CN）

- `docs/zh-CN/**` 是生成的内容；除非用户明确要求，否则不要编辑。
- 流程：更新英文文档 → 调整术语表（`docs/.i18n/glossary.zh-CN.json`）→ 运行 `scripts/docs-i18n` → 仅在被指示时进行针对性修复。
- 翻译记忆：`docs/.i18n/zh-CN.tm.jsonl`（生成的）。
- 参见 `docs/.i18n/README.md`。
- 该流程可能较慢/低效；如果拖慢了进度，请在 Discord 上联系 @jospalmbier，而不是自行绕过。

## exe.dev 虚拟机操作（通用）

- 访问：稳定路径为 `ssh exe.dev` 然后 `ssh vm-name`（假设 SSH 密钥已设置）。
- SSH 不稳定时：使用 exe.dev Web 终端或 Shelley（Web Agent）；为长时间操作保持一个 tmux 会话。
- 更新：`sudo npm i -g openclaw@latest`（全局安装需要 root 权限访问 `/usr/lib/node_modules`）。
- 配置：使用 `openclaw config set ...`；确保设置了 `gateway.mode=local`。
- Discord：仅存储原始 token（不带 `DISCORD_BOT_TOKEN=` 前缀）。
- 重启：停止旧网关并运行：
  `pkill -9 -f openclaw-gateway || true; nohup openclaw gateway run --bind loopback --port 18789 --force > /tmp/openclaw-gateway.log 2>&1 &`
- 验证：`openclaw channels status --probe`、`ss -ltnp | rg 18789`、`tail -n 120 /tmp/openclaw-gateway.log`。

## 构建、测试和开发命令

- 运行时基线：Node **22+**（保持 Node + Bun 路径可用）。
- 安装依赖：`pnpm install`
- 预提交钩子：`prek install`（运行与 CI 相同的检查）
- 也支持：`bun install`（修改依赖/补丁时保持 `pnpm-lock.yaml` + Bun 补丁同步）。
- TypeScript 执行优先使用 Bun（脚本、开发、测试）：`bun <file.ts>` / `bunx <tool>`。
- 开发模式运行 CLI：`pnpm openclaw ...`（bun）或 `pnpm dev`。
- Node 仍支持运行构建产物（`dist/*`）和生产环境安装。
- Mac 打包（开发）：`scripts/package-mac-app.sh` 默认使用当前架构。发布清单：`docs/platforms/mac/release.md`。
- 类型检查/构建：`pnpm build`
- TypeScript 检查：`pnpm tsgo`
- 代码检查/格式化：`pnpm check`
- 格式检查：`pnpm format`（oxfmt --check）
- 格式修复：`pnpm format:fix`（oxfmt --write）
- 测试：`pnpm test`（vitest）；覆盖率：`pnpm test:coverage`

## 代码风格与命名规范

- 语言：TypeScript（ESM）。优先使用严格类型；避免使用 `any`。
- 使用 Oxlint 和 Oxfmt 进行格式化/代码检查；提交前运行 `pnpm check`。
- 为复杂或不明显的逻辑添加简短的代码注释。
- 保持文件简洁；提取辅助函数而非创建"V2"副本。使用现有模式处理 CLI 选项和通过 `createDefaultDeps` 进行依赖注入。
- 目标将文件控制在约 700 行以内；仅为指导原则（非硬性限制）。当能提升清晰度或可测试性时进行拆分/重构。
- 命名：产品/应用/文档标题使用 **OpenClaw**；CLI 命令、包/二进制文件、路径和配置键使用 `openclaw`。

## 发布渠道（命名）

- stable：仅标记发布（例如 `vYYYY.M.D`），npm dist-tag 为 `latest`。
- beta：预发布标记 `vYYYY.M.D-beta.N`，npm dist-tag 为 `beta`（可能不包含 macOS 应用）。
- dev：`main` 分支的最新提交（无标记；git checkout main）。

## 测试指南

- 框架：Vitest，V8 覆盖率阈值（70% 行/分支/函数/语句）。
- 命名：测试文件匹配源文件名，使用 `*.test.ts`；端到端测试使用 `*.e2e.test.ts`。
- 修改逻辑代码后推送前运行 `pnpm test`（或 `pnpm test:coverage`）。
- 不要将测试 worker 数设置超过 16；已经尝试过。
- 实时测试（真实密钥）：`CLAWDBOT_LIVE_TEST=1 pnpm test:live`（仅 OpenClaw）或 `LIVE=1 pnpm test:live`（包含 Provider 实时测试）。Docker：`pnpm test:docker:live-models`、`pnpm test:docker:live-gateway`。引导 Docker E2E：`pnpm test:docker:onboard`。
- 完整套件及覆盖范围：`docs/testing.md`。
- 纯粹的测试添加/修复通常**不需要**更新日志条目，除非它们改变了面向用户的行为或用户要求添加。
- 移动端：使用模拟器前，检查已连接的真实设备（iOS + Android），优先使用真实设备。

## 提交与 Pull Request 指南

**完整的维护者 PR 工作流程：** `.agents/skills/PR_WORKFLOW.md` — 分类优先级、质量标准、rebase 规则、提交/更新日志规范、共同贡献者策略，以及 3 步骤技能管线（`review-pr` > `prepare-pr` > `merge-pr`）。

- 使用 `scripts/committer "<msg>" <file...>` 创建提交；避免手动 `git add`/`git commit`，以保持暂存区范围可控。
- 遵循简洁、面向操作的提交消息（例如 `CLI: add verbose flag to send`）。
- 将相关变更分组；避免捆绑不相关的重构。
- 提交 PR 前阅读：`docs/help/submitting-a-pr.md`（[提交 PR](https://docs.openclaw.ai/help/submitting-a-pr)）
- 提交 Issue 前阅读：`docs/help/submitting-an-issue.md`（[提交 Issue](https://docs.openclaw.ai/help/submitting-an-issue)）

## 快捷命令

- `sync`：如果工作目录有未提交的更改，提交所有变更（选择合适的 Conventional Commit 消息），然后 `git pull --rebase`；如果 rebase 冲突且无法解决，则停止；否则 `git push`。

## 安全与配置提示

- Web Provider 将凭据存储在 `~/.openclaw/credentials/`；如果已登出，重新运行 `openclaw login`。
- Pi 会话默认存储在 `~/.openclaw/sessions/` 下；基础目录不可配置。
- 环境变量：参见 `~/.profile`。
- 绝不提交或发布真实的电话号码、视频或实时配置值。在文档、测试和示例中使用明显的虚假占位符。
- 发布流程：在进行任何发布工作前，始终阅读 `docs/reference/RELEASING.md` 和 `docs/platforms/mac/release.md`；文档已解答的例行问题不要再询问。

## 故障排除

- 品牌重塑/迁移问题或旧配置/服务警告：运行 `openclaw doctor`（参见 `docs/gateway/doctor.md`）。

## Agent 专用说明

- 术语："makeup" = "mac app"。
- 绝不编辑 `node_modules`（全局/Homebrew/npm/git 安装也是如此）。更新会覆盖内容。技能笔记放在 `tools.md` 或 `AGENTS.md` 中。
- 在仓库中添加新的 `AGENTS.md` 时，同时创建一个指向它的 `CLAUDE.md` 符号链接（示例：`ln -s AGENTS.md CLAUDE.md`）。
- Signal："update fly" => `fly ssh console -a flawd-bot -C "bash -lc 'cd /data/clawd/openclaw && git pull --rebase origin main'"` 然后 `fly machines restart e825232f34d058 -a flawd-bot`。
- 处理 GitHub Issue 或 PR 时，在任务结束时打印完整 URL。
- 回答问题时，仅提供高可信度的答案：在代码中验证；不要猜测。
- 绝不更新 Carbon 依赖。
- 任何带有 `pnpm.patchedDependencies` 的依赖必须使用精确版本（不带 `^`/`~`）。
- 修补依赖（pnpm patches、overrides 或 vendored 变更）需要明确批准；默认不执行此操作。
- CLI 进度条：使用 `src/cli/progress.ts`（`osc-progress` + `@clack/prompts` spinner）；不要手写 spinner/进度条。
- 状态输出：保持表格 + ANSI 安全换行（`src/terminal/table.ts`）；`status --all` = 只读/可粘贴，`status --deep` = 探测。
- 网关目前仅作为菜单栏应用运行；没有单独安装 LaunchAgent/helper 标签。通过 OpenClaw Mac 应用或 `scripts/restart-mac.sh` 重启；验证/终止请使用 `launchctl print gui/$UID | grep openclaw` 而不是假设固定标签。**在 macOS 上调试时，通过应用启动/停止网关，而非临时 tmux 会话；移交前终止任何临时隧道。**
- macOS 日志：使用 `./scripts/clawlog.sh` 查询 OpenClaw 子系统的统一日志；支持跟踪/尾随/类别过滤器，需要免密 sudo 访问 `/usr/bin/log`。
- 如果本地有共享防护规则，请查阅；否则遵循本仓库的指南。
- SwiftUI 状态管理（iOS/macOS）：优先使用 `Observation` 框架（`@Observable`、`@Bindable`），而非 `ObservableObject`/`@StateObject`；除非兼容性需要，不要引入新的 `ObservableObject`，修改相关代码时迁移现有用法。
- 连接 Provider：添加新连接时，更新每个 UI 界面和文档（macOS 应用、Web UI、移动端（如适用）、引导/概览文档），并添加匹配的状态和配置表单，以保持 Provider 列表和设置同步。
- 版本位置：`package.json`（CLI）、`apps/android/app/build.gradle.kts`（versionName/versionCode）、`apps/ios/Sources/Info.plist` + `apps/ios/Tests/Info.plist`（CFBundleShortVersionString/CFBundleVersion）、`apps/macos/Sources/OpenClaw/Resources/Info.plist`（CFBundleShortVersionString/CFBundleVersion）、`docs/install/updating.md`（固定的 npm 版本）、`docs/platforms/mac/release.md`（APP_VERSION/APP_BUILD 示例）、Peekaboo Xcode 项目/Info.plists（MARKETING_VERSION/CURRENT_PROJECT_VERSION）。
- **重启应用：** "restart iOS/Android apps" 意为重新构建（重新编译/安装）并重新启动，而非仅仅终止/启动。
- **设备检查：** 测试前，先检查已连接的真实设备（iOS/Android），再考虑使用模拟器/仿真器。
- iOS Team ID 查找：`security find-identity -p codesigning -v` → 使用 Apple Development (…) TEAMID。备选：`defaults read com.apple.dt.Xcode IDEProvisioningTeamIdentifiers`。
- A2UI bundle hash：`src/canvas-host/a2ui/.bundle.hash` 是自动生成的；忽略意外变更，仅在需要时通过 `pnpm canvas:a2ui:bundle`（或 `scripts/bundle-a2ui.sh`）重新生成。将 hash 作为单独的提交。
- 发布签名/公证密钥在仓库外管理；遵循内部发布文档。
- 公证认证环境变量（`APP_STORE_CONNECT_ISSUER_ID`、`APP_STORE_CONNECT_KEY_ID`、`APP_STORE_CONNECT_API_KEY_P8`）应在你的环境中设置（参见内部发布文档）。
- **多 Agent 安全：** 除非明确要求，否则**不要**创建/应用/丢弃 `git stash` 条目（包括 `git pull --rebase --autostash`）。假设其他 Agent 可能在工作；保持不相关的 WIP 不变，避免跨切面的状态变更。
- **多 Agent 安全：** 当用户说 "push" 时，你可以执行 `git pull --rebase` 来整合最新变更（绝不丢弃其他 Agent 的工作）。当用户说 "commit" 时，仅限于你的变更。当用户说 "commit all" 时，分组提交所有内容。
- **多 Agent 安全：** 除非明确要求，否则**不要**创建/移除/修改 `git worktree` 检出（或编辑 `.worktrees/*`）。
- **多 Agent 安全：** 除非明确要求，否则**不要**切换分支/检出其他分支。
- **多 Agent 安全：** 多个 Agent 同时运行是可以的，只要每个 Agent 有自己的会话。
- **多 Agent 安全：** 当你看到不认识的文件时，继续工作；专注于你的变更，只提交那些。
- 代码检查/格式化噪音：
  - 如果暂存 + 未暂存的差异仅为格式化变更，自动解决，无需询问。
  - 如果已请求提交/推送，自动暂存并将仅格式化的后续变更包含在同一提交中（或在需要时创建一个小的后续提交），无需额外确认。
  - 仅当变更涉及语义（逻辑/数据/行为）时才询问。
- Lobster 接缝：使用 `src/terminal/palette.ts` 中的共享 CLI 调色板（不要硬编码颜色）；根据需要将调色板应用于引导/配置提示和其他 TTY UI 输出。
- **多 Agent 安全：** 报告聚焦于你的编辑；避免防护规则免责声明，除非确实被阻塞；当多个 Agent 修改同一文件时，如果安全则继续；仅在相关时以简短的 "other files present" 说明结尾。
- Bug 调查：在得出结论前，阅读相关 npm 依赖的源代码和所有相关本地代码；追求高可信度的根因分析。
- 代码风格：为复杂逻辑添加简短注释；尽可能将文件控制在约 500 行以内（根据需要拆分/重构）。
- 工具 schema 防护（google-antigravity）：避免在工具输入 schema 中使用 `Type.Union`；不要使用 `anyOf`/`oneOf`/`allOf`。字符串列表使用 `stringEnum`/`optionalStringEnum`（Type.Unsafe enum），使用 `Type.Optional(...)` 而非 `... | null`。保持顶级工具 schema 为 `type: "object"` 加 `properties`。
- 工具 schema 防护：避免在工具 schema 中使用原始的 `format` 属性名；某些验证器将 `format` 视为保留关键字并会拒绝该 schema。
- 当被要求打开 "session" 文件时，打开 `~/.openclaw/agents/<agentId>/sessions/*.jsonl` 下的 Pi 会话日志（使用系统提示中 Runtime 行的 `agent=<id>` 值；除非指定了特定 ID，否则使用最新的），而不是默认的 `sessions.json`。如果需要其他机器的日志，通过 Tailscale SSH 访问并读取相同路径。
- 不要通过 SSH 重新构建 macOS 应用；重新构建必须直接在 Mac 上运行。
- 绝不向外部消息平台（WhatsApp、Telegram）发送流式/部分回复；只有最终回复才应发送到那里。流式/工具事件仍可发送到内部 UI/控制渠道。
- 语音唤醒转发提示：
  - 命令模板应保持 `openclaw-mac agent --message "${text}" --thinking low`；`VoiceWakeForwarder` 已对 `${text}` 进行 shell 转义。不要添加额外引号。
  - launchd PATH 较为精简；确保应用的 launch agent PATH 包含标准系统路径加上你的 pnpm bin 路径（通常为 `$HOME/Library/pnpm`），以便通过 `openclaw-mac` 调用时能解析 `pnpm`/`openclaw` 二进制文件。
- 对于包含 `!` 的手动 `openclaw message send` 消息，使用下面提到的 heredoc 模式以避免 Bash 工具的转义问题。
- 发布防护：未经操作者明确同意，不要更改版本号；在运行任何 npm publish/release 步骤前始终请求许可。

## NPM + 1Password（发布/验证）

- 使用 1password 技能；所有 `op` 命令必须在新的 tmux 会话中运行。
- 登录：`eval "$(op signin --account my.1password.com)"`（应用已解锁 + 集成已开启）。
- OTP：`op read 'op://Private/Npmjs/one-time password?attribute=otp'`。
- 发布：`npm publish --access public --otp="<otp>"`（在包目录中运行）。
- 无本地 npmrc 副作用的验证：`npm view <pkg> version --userconfig "$(mktemp)"`。
- 发布后终止 tmux 会话。
