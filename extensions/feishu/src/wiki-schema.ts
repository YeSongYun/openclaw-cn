import { Type, type Static } from "@sinclair/typebox";

export const FeishuWikiSchema = Type.Union([
  Type.Object({
    action: Type.Literal("spaces"),
  }),
  Type.Object({
    action: Type.Literal("nodes"),
    space_id: Type.String({ description: "知识空间 ID" }),
    parent_node_token: Type.Optional(
      Type.String({ description: "父节点令牌（可选，省略则为根节点）" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("get"),
    token: Type.String({ description: "知识库节点令牌（从 URL /wiki/XXX 中提取）" }),
  }),
  Type.Object({
    action: Type.Literal("search"),
    query: Type.String({ description: "搜索查询" }),
    space_id: Type.Optional(Type.String({ description: "限制搜索到此空间（可选）" })),
  }),
  Type.Object({
    action: Type.Literal("create"),
    space_id: Type.String({ description: "知识空间 ID" }),
    title: Type.String({ description: "节点标题" }),
    obj_type: Type.Optional(
      Type.Union([Type.Literal("docx"), Type.Literal("sheet"), Type.Literal("bitable")], {
        description: "对象类型（默认：docx）",
      }),
    ),
    parent_node_token: Type.Optional(
      Type.String({ description: "父节点令牌（可选，省略则为根节点）" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("move"),
    space_id: Type.String({ description: "源知识空间 ID" }),
    node_token: Type.String({ description: "要移动的节点令牌" }),
    target_space_id: Type.Optional(
      Type.String({ description: "目标空间 ID（可选，省略则为同一空间）" }),
    ),
    target_parent_token: Type.Optional(
      Type.String({ description: "目标父节点令牌（可选，省略则为根节点）" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("rename"),
    space_id: Type.String({ description: "知识空间 ID" }),
    node_token: Type.String({ description: "要重命名的节点令牌" }),
    title: Type.String({ description: "新标题" }),
  }),
]);

export type FeishuWikiParams = Static<typeof FeishuWikiSchema>;
