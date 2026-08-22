# MoMo Bridge

这是一个 MarginNote 4 Web 插件：在脑图中多选由 OhMyMN AutoComplete 制作的单词卡片，读取标题中的第一个英文单词原型，并把卡片中的英文上下文和最后一行中文翻译作为对应单词的墨墨例句上传。

## 使用前提

- MarginNote 4.2.3 或更高版本。
- 卡片标题使用 AutoComplete 的格式，例如 `shrink; shrank; shrunk; shrinking; shrinks`。
- 开启 AutoComplete 的“自动摘录上下文”；插件从卡片摘录中读取英文句子，从评论中读取中文翻译。若末尾有 `#2000EN #阅读 #Text2` 形式的标签行，标签不会被当作翻译，并会将去掉 `#` 和空格后的内容作为例句来源；没有标签时来源为空。
- 墨墨 App 已开启开放 API：`我的` → `更多设置` → `实验功能` → `开放 API`。
- 目标是墨墨云词本 ID。墨墨开放 API 当前没有把单词写入任意内置词书的接口；插件通过读取并更新云词本内容实现指定词本导入。

## 开发

```powershell
npm install
npm test
npm run dev
```

`npm test` 覆盖标题原型提取、云词本去重和 MarginNote 多选适配器。

## 构建

```powershell
npm run build
```

构建会生成：

```text
MoMo Bridge-v2.0.0.mnaddon
```

在 MarginNote 中安装这个 `.mnaddon` 文件后，点击插件图标打开窗口。

## 使用流程

1. 在窗口中填写墨墨开放 API Token，点击“加载词本”。Token 只保存在本机插件偏好设置，不会写入卡片或日志。
2. 选择目标云词本；也可以直接填写云词本 ID。
3. 在 MarginNote 脑图中多选单词卡片，回到插件点击“识别已选卡片”。
4. 在“导入内容”中勾选“添加单词”和/或“添加例句”，可以只勾选一项，也可以同时勾选两项，但至少需要选择一项。仅添加例句时不需要云词本。例句会同时添加到卡片识别出的单词原型和句中出现的变形词（例如 `sweep` 与 `sweeping`）。
5. 检查原型和例句预览，确认后点击相应按钮。已有单词会计为“已存在”，无法由墨墨确认写入的单词会计为“失败”；重复例句不会再次创建，插件会重新读取墨墨例句列表核验上传结果。

插件按卡片标题的第一个分号片段识别原型，支持英文和中文分号；不猜测缺失原型，并保持首次出现顺序、大小写无关去重。例句上传使用墨墨开放 API 的单词 ID，因此需要先把单词导入或确认它已存在于墨墨词库。

## API 依据

- MarginNote：`StudyController.notebookController.mindmapView.selViewLst` 获取脑图当前多选节点，节点标题来自 `MindMapNode.note.noteTitle`，上下文来自 `MbBookNote.excerptText`，翻译来自 `MbBookNote.comments`。
- 墨墨：云词本使用 `/open/api/v1/memo/notepads`；例句使用 `/open/api/v1/memo/vocabulary/query` 查询单词 ID，再调用 `/open/api/v1/memo/phrases` 创建例句（墨墨标签使用“考研”，来源按卡片末尾标签动态设置）。
- 请求使用 `Authorization: Bearer <Token>`，并遵守墨墨公开频控。
