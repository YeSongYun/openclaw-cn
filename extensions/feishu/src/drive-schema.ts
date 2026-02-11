import { Type, type Static } from "@sinclair/typebox";

const FileType = Type.Union([
  Type.Literal("doc"),
  Type.Literal("docx"),
  Type.Literal("sheet"),
  Type.Literal("bitable"),
  Type.Literal("folder"),
  Type.Literal("file"),
  Type.Literal("mindnote"),
  Type.Literal("shortcut"),
]);

export const FeishuDriveSchema = Type.Union([
  Type.Object({
    action: Type.Literal("list"),
    folder_token: Type.Optional(
      Type.String({ description: "文件夹令牌（可选，省略则为根目录）" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("info"),
    file_token: Type.String({ description: "文件或文件夹令牌" }),
    type: FileType,
  }),
  Type.Object({
    action: Type.Literal("create_folder"),
    name: Type.String({ description: "文件夹名称" }),
    folder_token: Type.Optional(
      Type.String({ description: "父文件夹令牌（可选，省略则为根目录）" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("move"),
    file_token: Type.String({ description: "要移动的文件令牌" }),
    type: FileType,
    folder_token: Type.String({ description: "目标文件夹令牌" }),
  }),
  Type.Object({
    action: Type.Literal("delete"),
    file_token: Type.String({ description: "要删除的文件令牌" }),
    type: FileType,
  }),
]);

export type FeishuDriveParams = Static<typeof FeishuDriveSchema>;
