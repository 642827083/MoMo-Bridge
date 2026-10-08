# MoMo Import 2.3.0

此标签保存从原始正式安装包提取的完整运行资源，其中 JavaScript 和 Web 资源可能已压缩；它不是重新构建的开发源码。未找到与安装包完全一致的历史开发源码提交，因此保留安装包的实际内容供核对。

安装包：MoMo Import-v2.3.0.mnaddon

SHA-256：ed7064670ca89db2dc398d48030b4ee71123d0130b46a04bcc19a6eab871a34c

安装请从对应 GitHub Release 下载 .mnaddon 文件。

## 粘连例句识别优化

- 将标题词形与 `the`、`of` 等功能词的粘连修复，与标题词形和普通英文词的粘连修复统一为同一个判断流程。
- 继续支持 `destroyedthe`、`restructuringof`、`sweepingthrough` 等缺少空格的例句。
- 通过常见派生后缀和复合词后缀保护 `lightness`、`lightning` 等正常英文单词，减少误拆。
- 保持例句原文、中文翻译、词根和变形词关联上传逻辑不变。
- 项目源代码注释统一使用中文，便于维护。
