# MarginNote 墨墨单词书导入实现计划

> **供执行代理使用：** 必须使用 `superpowers:executing-plans` 逐任务实施并在每项后验证。

**目标：** 构建一个 MarginNote 4 插件窗口，将多选脑图单词卡的标题原型导入指定的墨墨背单词单词书。

**架构：** 使用 MN Rails 的 React + Vite Web 模板提供设置、预览和导入结果界面。将与 MarginNote 的选区通信、标题解析、墨墨 API 和导入编排分别实现，UI 只消费这些稳定接口。

**技术栈：** MN Rails、React JSX、Vite、MarginNote JSB、墨墨开放 API、Node 内置测试运行器。

## 全局约束

- 插件包必须兼容 MarginNote 4。
- Token 仅保存在本机插件配置中，绝不写入卡片或日志。
- 只处理 OhMyMN AutoComplete 标题的首个分号片段。
- 所有写入操作必须经预览确认后执行。
- API 调用必须遵守 10 秒 20 次、60 秒 40 次的公开频控。

---

### 任务 1：创建并验证插件工程

**文件：**
- 创建：`momo-vocabulary-import/`（由 MN Rails 生成）
- 修改：`momo-vocabulary-import/README.md`

**接口：**
- 产出：可运行的 MN Rails Web 插件工程及其打包命令。

- [ ] 运行 MN Rails，选择 React + Vite Web 模板并填写插件元数据。
- [ ] 安装生成项目的依赖。
- [ ] 运行项目既有测试或构建命令，确认模板可构建。
- [ ] 在 README 记录开发、构建与安装命令。

### 任务 2：实现并测试标题解析

**文件：**
- 创建：`momo-vocabulary-import/src/domain/lemma.js`
- 创建：`momo-vocabulary-import/test/lemma.test.js`

**接口：**
- 消费：字符串标题数组。
- 产出：`extractLemma(title)` 与 `collectLemmas(titles)`。

- [ ] 编写失败测试，覆盖英文/中文分号、空白、重复词和不合法首段。
- [ ] 运行测试并确认因模块尚不存在而失败。
- [ ] 实现标题首段提取、英文词校验、小写化和稳定去重。
- [ ] 运行测试并确认全部通过。

### 任务 3：实现墨墨客户端与导入编排

**文件：**
- 创建：`momo-vocabulary-import/src/services/momo-client.js`
- 创建：`momo-vocabulary-import/src/services/import-runner.js`
- 创建：`momo-vocabulary-import/test/import-runner.test.js`

**接口：**
- 消费：`{ token, bookId, words }`。
- 产出：`importWords(config, words, transport)`，按词提供 `success`、`duplicate`、`failed` 结果。

- [ ] 先编写失败测试，覆盖确认前不调用传输层、逐词结果、认证失败、网络失败和频控等待。
- [ ] 依据墨墨开放 API 文档确认并封装精确的目标单词书写入操作。
- [ ] 实现 Token 请求头、目标书 ID 传递、结果归类与节流。
- [ ] 运行测试并确认全部通过。

### 任务 4：接入 MarginNote 选区和插件界面

**文件：**
- 创建：`momo-vocabulary-import/src/services/marginnote-selection.js`
- 修改：`momo-vocabulary-import/src/` 下的模板入口与 React 页面
- 创建：`momo-vocabulary-import/test/selection-adapter.test.js`

**接口：**
- 消费：MarginNote 原生多选卡片上下文。
- 产出：设置面板、预览确认、导入进度及结果界面。

- [ ] 先编写选区适配器和 UI 状态的失败测试。
- [ ] 实现读取多选卡片标题、缺失选区提示和测试环境注入。
- [ ] 实现 Token 与目标单词书 ID 的本地设置和遮蔽显示。
- [ ] 实现导入预览、确认按钮、进度和失败单词复制。
- [ ] 运行测试与生产构建，确认没有错误。

### 任务 5：打包与交付验证

**文件：**
- 修改：`momo-vocabulary-import/README.md`
- 产出：`momo-vocabulary-import/*.mnaddon`

- [ ] 运行完整测试套件。
- [ ] 运行生产打包并检查 `.mnaddon` 内含插件清单、原生入口和 Web 资源。
- [ ] 在 README 写明如何从墨墨 App 获取 Token，以及如何填写目标单词书 ID。
- [ ] 复查设计文档的每项需求，记录验证结果。
