# 墨墨单词书导入

这是一个 MarginNote 4 Web 插件：在脑图中多选由 OhMyMN AutoComplete 制作的单词卡片，读取标题中的第一个英文单词原型，预览后追加到指定的墨墨“云词本”。

## 使用前提

- MarginNote 4.2.3 或更高版本。
- 卡片标题使用 AutoComplete 的格式，例如 `shrink; shrank; shrunk; shrinking; shrinks`。
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
momo-vocabulary-import-v0.1.0.mnaddon
```

在 MarginNote 中安装这个 `.mnaddon` 文件后，点击插件图标打开窗口。

## 使用流程

1. 在窗口中填写墨墨开放 API Token，点击“加载词本”。Token 只保存在本机插件偏好设置，不会写入卡片或日志。
2. 选择目标云词本；也可以直接填写云词本 ID。
3. 在 MarginNote 脑图中多选单词卡片，回到插件点击“识别已选卡片”。
4. 检查原型预览，确认后点击“确认导入”。已有单词会计为“已存在”，无法由墨墨确认写入的单词会计为“失败”。

插件按卡片标题的第一个分号片段识别原型，支持英文和中文分号；不猜测缺失原型，并保持首次出现顺序、大小写无关去重。

## API 依据

- MarginNote：`StudyController.notebookController.mindmapView.selViewLst` 获取脑图当前多选节点，节点标题来自 `MindMapNode.note.noteTitle`。
- 墨墨：`GET /open/api/v1/notepads` 查询云词本，`GET /open/api/v1/notepads/{id}` 读取词本，`POST /open/api/v1/notepads/{id}` 更新词本。
- 请求使用 `Authorization: Bearer <Token>`，并遵守墨墨公开频控。
