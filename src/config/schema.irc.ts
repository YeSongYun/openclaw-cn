export const IRC_FIELD_LABELS: Record<string, string> = {
  "channels.irc": "IRC",
  "channels.irc.dmPolicy": "IRC 私信策略",
  "channels.irc.nickserv.enabled": "IRC NickServ 已启用",
  "channels.irc.nickserv.service": "IRC NickServ 服务",
  "channels.irc.nickserv.password": "IRC NickServ 密码",
  "channels.irc.nickserv.passwordFile": "IRC NickServ 密码文件",
  "channels.irc.nickserv.register": "IRC NickServ 注册",
  "channels.irc.nickserv.registerEmail": "IRC NickServ 注册邮箱",
};

export const IRC_FIELD_HELP: Record<string, string> = {
  "channels.irc.configWrites":
    "允许 IRC 在响应频道事件/命令时写入配置（默认：true）。",
  "channels.irc.dmPolicy":
    '私信访问控制（推荐 "pairing"）。"open" 需要设置 channels.irc.allowFrom=["*"]。',
  "channels.irc.nickserv.enabled":
    "连接后启用 NickServ 认证/注册（配置密码后默认启用）。",
  "channels.irc.nickserv.service": "NickServ 服务昵称（默认：NickServ）。",
  "channels.irc.nickserv.password": "用于 IDENTIFY/REGISTER 的 NickServ 密码（敏感信息）。",
  "channels.irc.nickserv.passwordFile": "包含 NickServ 密码的可选文件路径。",
  "channels.irc.nickserv.register":
    "如果为 true，每次连接时发送 NickServ REGISTER。首次注册时使用一次，然后禁用。",
  "channels.irc.nickserv.registerEmail":
    "用于 NickServ REGISTER 的邮箱（register=true 时必填）。",
};
