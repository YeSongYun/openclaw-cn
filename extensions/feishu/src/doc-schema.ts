import { Type, type Static } from "@sinclair/typebox";

export const FeishuDocSchema = Type.Union([
  Type.Object({
    action: Type.Literal("read"),
    doc_token: Type.String({ description: "文档令牌（从 URL /docx/XXX 中提取）" }),
  }),
  Type.Object({
    action: Type.Literal("write"),
    doc_token: Type.String({ description: "文档令牌" }),
    content: Type.String({
      description: "要写入的 Markdown 内容（替换整个文档内容）",
    }),
  }),
  Type.Object({
    action: Type.Literal("append"),
    doc_token: Type.String({ description: "文档令牌" }),
    content: Type.String({ description: "要追加到文档末尾的 Markdown 内容" }),
  }),
  Type.Object({
    action: Type.Literal("create"),
    title: Type.String({ description: "文档标题" }),
    folder_token: Type.Optional(Type.String({ description: "目标文件夹令牌（可选）" })),
  }),
  Type.Object({
    action: Type.Literal("list_blocks"),
    doc_token: Type.String({ description: "文档令牌" }),
  }),
  Type.Object({
    action: Type.Literal("get_block"),
    doc_token: Type.String({ description: "文档令牌" }),
    block_id: Type.String({ description: "块 ID（来自 list_blocks）" }),
  }),
  Type.Object({
    action: Type.Literal("update_block"),
    doc_token: Type.String({ description: "文档令牌" }),
    block_id: Type.String({ description: "块 ID（来自 list_blocks）" }),
    content: Type.String({ description: "新文本内容" }),
  }),
  Type.Object({
    action: Type.Literal("delete_block"),
    doc_token: Type.String({ description: "文档令牌" }),
    block_id: Type.String({ description: "块 ID" }),
  }),
]);

export type FeishuDocParams = Static<typeof FeishuDocSchema>;
