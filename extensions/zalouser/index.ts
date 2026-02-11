import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { zalouserDock, zalouserPlugin } from "./src/channel.js";
import { setZalouserRuntime } from "./src/runtime.js";
import { ZalouserToolSchema, executeZalouserTool } from "./src/tool.js";

const plugin = {
  id: "zalouser",
  name: "Zalo 个人",
  description: "Zalo 个人账号消息（基于 zca-cli）",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setZalouserRuntime(api.runtime);
    // Register channel plugin (for onboarding & gateway)
    api.registerChannel({ plugin: zalouserPlugin, dock: zalouserDock });

    // Register agent tool
    api.registerTool({
      name: "zalouser",
      label: "Zalo 个人",
      description:
        "通过 Zalo 个人账号发送消息和访问数据。" +
        "操作：send（发送文本消息）、image（发送图片 URL）、link（发送链接）、" +
        "friends（列出/搜索好友）、groups（列出群组）、me（个人资料）、status（认证检查）。",
      parameters: ZalouserToolSchema,
      execute: executeZalouserTool,
    } as AnyAgentTool);
  },
};

export default plugin;
