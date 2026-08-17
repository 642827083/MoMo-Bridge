import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../web/src/App.jsx", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../web/src/styles.css", import.meta.url), "utf8");
const panelSource = await readFile(new URL("../src/WebPanelController.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const webBuildSource = await readFile(new URL("../scripts/web-build.js", import.meta.url), "utf8");

test("Panel uses the product name and keeps only the compact web subtitle", () => {
  assert.match(panelSource, /controller\.titleLabel\.text = "MoMo Import"/);
  assert.doesNotMatch(panelSource, /__MN_WEB_PANEL_TITLE__/);
  assert.match(source, /MarginNote → 墨墨背单词/);
  assert.doesNotMatch(source, /单词书导入/);
  assert.match(htmlSource, /<title>MoMo Import<\/title>/);
  assert.match(webBuildSource, /<title>MoMo Import<\/title>/);
  assert.doesNotMatch(webBuildSource, /MarginNote Web Template/);
});

test("AI settings page keeps connection fields separate from article options", () => {
  assert.match(source, /const \[activePage, setActivePage\] = useState\("import"\)/);
  assert.match(source, /AI 设置/);
  assert.match(source, /配置用于生成 AI 阅读文章的 AI 服务/);
  assert.match(source, /id="ai-api-key"/);
  assert.match(source, /id="ai-base-url"/);
  assert.match(source, /id="ai-model"/);
  assert.match(source, /MNBridge\.send\("getAiSettings"\)/);
  assert.match(source, /MNBridge\.send\("saveAiSettings"/);
  assert.match(source, /MNBridge\.send\("testAiConnection"/);
  assert.match(source, /测试连接/);
  assert.match(source, /保存设置/);
  assert.match(source, /各服务商 API Key 仅保存在本机/);
  assert.match(styleSource, /\.ai-settings-layout/);
  assert.match(styleSource, /\.ai-settings-card/);
});

test("AI settings supports multiple providers and keeps provider profiles separate", () => {
  assert.match(source, /const AI_PROVIDERS = \[/);
  assert.match(source, /value: "deepseek"/);
  assert.match(source, /value: "openai"/);
  assert.match(source, /value: "siliconflow"/);
  assert.match(source, /value: "qwen"/);
  assert.match(source, /value: "zhipu"/);
  assert.match(source, /value: "moonshot"/);
  assert.match(source, /value: "custom"/);
  assert.match(source, /id="ai-provider"/);
  assert.match(source, /function switchAiProvider\(nextProvider\)/);
  assert.match(source, /providers: profiles/);
  assert.match(source, /provider: aiProvider/);
  assert.match(source, /切换服务商会自动带入对应 API 地址和推荐模型/);
});

test("Three pages share heading, history, and mobile layout foundations", () => {
  assert.match(styleSource, /\.ai-settings-heading\s*\{[^}]*padding:\s*0;[^}]*border:\s*0;/s);
  assert.match(styleSource, /\.ai-settings-heading p:last-child\s*\{[^}]*font-size:\s*12px;[^}]*line-height:\s*1\.5;/s);
  assert.match(styleSource, /\.reading-history-item\s*\{[^}]*border-radius:\s*6px;/s);
  assert.match(styleSource, /\.reading-history-item summary\s*\{[^}]*padding:\s*9px 10px;/s);
  assert.match(styleSource, /\.import-layout,\s*\n\s*\.reading-layout,\s*\n\s*\.ai-settings-layout\s*\{[^}]*padding:\s*18px;/s);
  assert.doesNotMatch(styleSource, /@media[\s\S]*\.import-options\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(source, /各 AI 服务商 API Key/);
});

test("AI 阅读页面只展示已背诵数据并按最多三十个单词生成", () => {
  assert.match(source, /AI 阅读/);
  assert.match(source, /function localDayKey\(value\)/);
  assert.match(source, /function isCurrentLocalDay\(value\)/);
  assert.match(source, /function generatedReadingKeys\(entries, todayOnly = false\)/);
  assert.match(source, /todayOnly && !isCurrentLocalDay\(entry\?\.createdAt\)/);
  assert.match(source, /generatedReadingKeys\(readingHistory, true\)/);
  assert.match(source, /getTodayFinishedWords/);
  assert.match(source, /listAiReadingHistory/);
  assert.match(source, /MAX_READING_WORDS = 30/);
  assert.match(source, /四级/);
  assert.match(source, /六级/);
  assert.match(source, /考研/);
  assert.match(source, /生成中文翻译/);
  assert.match(source, /生成 AI 阅读/);
  assert.match(source, /生成下一篇/);
  assert.match(source, /重新生成文章/);
  assert.match(source, /复制英文/);
  assert.match(source, /复制中英对照/);
  assert.match(source, /已生成阅读/);
  assert.match(source, /待生成阅读/);
  assert.match(styleSource, /\.reading-layout/);
  assert.match(styleSource, /\.reading-article-body/);
  assert.match(styleSource, /\.ai-actions button\s*{[^}]*width:\s*104px/s);
  assert.match(styleSource, /\.ai-actions \.primary-action\s*{[^}]*width:\s*104px/s);
});

test("Token help link appears above the Token input", () => {
  const labelIndex = source.indexOf('htmlFor="momo-token"');
  const linkIndex = source.indexOf("href={TOKEN_HELP_URL}");
  const inputIndex = source.indexOf('id="momo-token"');

  assert.ok(labelIndex >= 0, "Token label should exist");
  assert.ok(linkIndex > labelIndex, "Token help link should follow the label");
  assert.ok(inputIndex > linkIndex, "Token input should follow the help link");
  assert.match(source, /如何获取墨墨 Token/);
  assert.match(source, /TOKEN_HELP_URL/);
  assert.match(source, /openExternalURL/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noreferrer"/);
});

test("Import UI uses loading the wordbook as the connection check", () => {
  assert.doesNotMatch(source, /function testConnection\(\)/);
  assert.doesNotMatch(source, /MNBridge\.send\("testMomoConnection"/);
  assert.match(source, /加载词本/);
  assert.match(source, /formatRemainingTime/);
  assert.match(source, /预计剩余/);
  assert.match(source, /estimateDeadline/);
  assert.match(source, /estimateInitialRemainingSeconds/);
  assert.match(source, /updateEstimateDeadline/);
  assert.doesNotMatch(source, /elapsedSeconds \/ completed/);
});

test("Selection errors distinguish an empty MarginNote selection", () => {
  assert.match(source, /selectedViewCount/);
  assert.match(source, /MarginNote 未返回已选卡片/);
});

test("Selection errors include title samples", () => {
  assert.match(source, /标题样例/);
  assert.match(source, /titleSamples/);
});

test("Import UI exposes independent word, example, and study checkboxes on one row", () => {
  assert.match(source, /const \[addWords, setAddWords\] = useState\(true\)/);
  assert.match(source, /const \[addExamples, setAddExamples\] = useState\(false\)/);
  assert.match(source, /const \[addStudy, setAddStudy\] = useState\(false\)/);
  assert.match(source, /const \[advanceStudy, setAdvanceStudy\] = useState\(false\)/);
  assert.equal((source.match(/type="checkbox"/g) || []).length, 5);
  assert.match(source, /添加单词/);
  assert.match(source, /添加例句/);
  assert.match(source, /添加背诵/);
  assert.match(source, /已在背诵中则提前复习/);
  assert.match(source, /addWords,\n\s+addExamples,/);
  assert.match(source, /addExamples,\n\s+addStudy,/);
  assert.doesNotMatch(source, /id="import-mode"/);
  assert.doesNotMatch(source, /<option value="both">/);
});

test("Import UI requires at least one import option", () => {
  assert.match(source, /const hasImportContent = addWords \|\| addExamples \|\| addStudy/);
  assert.match(source, /请至少选择一种导入内容/);
  assert.match(source, /const canPreview = hasImportContent/);
});

test("Import UI reports study-list results", () => {
  assert.match(source, /背诵：新增/);
  assert.match(source, /未新增通常表示单词已在背诵列表中/);
  assert.match(source, /请先在墨墨 App 中开启自动同步/);
  assert.match(source, /提前复习：成功/);
  assert.match(source, /未提前/);
  assert.match(source, /未提前原因：\{result\.study\.advanceError\}/);
  assert.match(source, /未提前通常表示单词尚未加入背诵列表、账号未达到 10 级/);
});

test("Advance review is subordinate to study import and resets when study is disabled", () => {
  assert.match(source, /\{addStudy \? \(/);
  assert.match(source, /if \(!checked\) setAdvanceStudy\(false\)/);
  assert.match(source, /addStudy,\n\s+advanceStudy,/);
  assert.match(source, /role="switch"/);
  assert.match(source, /已在背诵中则提前复习/);
  assert.match(source, /className="option-info"/);
  assert.match(source, /需 10 级账号并开启墨墨自动同步/);
});

test("Advance review help opens to the right in two bounded lines", () => {
  assert.match(styleSource, /\.option-info p\s*{[^}]*left:\s*calc\(100% \+ 6px\)/s);
  assert.match(styleSource, /\.option-info p\s*{[^}]*right:\s*auto/s);
  assert.match(styleSource, /\.option-info p\s*{[^}]*top:\s*50%/s);
  assert.match(styleSource, /\.option-info p\s*{[^}]*transform:\s*translateY\(-50%\)/s);
  assert.match(styleSource, /\.option-info p\s*{[^}]*width:\s*168px/s);
  assert.match(styleSource, /\.option-info-line\s*{[^}]*display:\s*block/s);
  assert.match(styleSource, /\.option-info-line\s*{[^}]*white-space:\s*nowrap/s);
  assert.equal((source.match(/className="option-info-line"/g) || []).length, 2);
});

test("Example import shows a subordinate duration notice only when selected", () => {
  assert.match(source, /\{addExamples \? \(/);
  assert.match(source, /className="option-guidance example-duration-note"/);
  assert.match(source, /例句较多时会自动分批上传，所需时间通常比只添加单词更长/);
});

test("Study import explains the vocabulary limit only when selected", () => {
  assert.match(source, /className="option-guidance study-limit-note"/);
  assert.match(source, /添加背诵会占用墨墨账号的单词上限，达到上限后将无法继续添加/);
  assert.match(styleSource, /\.example-duration-note\s*{[^}]*align-items:\s*center/s);
  assert.match(styleSource, /\.study-limit-note\s*{[^}]*align-items:\s*center/s);
  assert.match(styleSource, /\.study-advance-control\s*{[^}]*align-items:\s*center/s);
});

test("Import UI distinguishes existing words from example results", () => {
  assert.match(source, /单词成功/);
  assert.match(source, /单词已存在/);
  assert.match(source, /单词失败/);
  assert.match(source, /例句：成功/);
});

test("Import UI previews the dynamic example origin", () => {
  assert.match(source, /来源：\{example\.origin \|\| "（空）"\}/);
});

test("Import UI lists cards whose complete examples were not recognized", () => {
  assert.match(source, /查看未识别完整例句的卡片/);
  assert.match(source, /cardsWithoutExamples\.map/);
  assert.match(source, /未读取到标题/);
});

test("Import UI clarifies that the preview is truncated but all examples are uploaded", () => {
  assert.match(source, /当前仅预览前 8 条/);
  assert.match(source, /确认时将上传全部 \$\{previewExamples\.length\} 条例句/);
});

test("Import UI automatically queues example selections above ten", () => {
  assert.match(source, /MAX_EXAMPLES_PER_IMPORT = 10/);
  assert.doesNotMatch(source, /exampleLimitExceeded/);
  assert.match(source, /将自动分成/);
  assert.match(source, /每批最多 \{MAX_EXAMPLES_PER_IMPORT\} 条/);
  assert.match(source, /onProgress\(progress\)/);
  assert.match(source, /正在处理第/);
  assert.match(source, /正在等待重试/);
});

test("Import UI loads persistent history and retries only failed items", () => {
  assert.match(source, /const \[historyEntries, setHistoryEntries\] = useState\(\[\]\)/);
  assert.match(source, /MNBridge\.send\("listImportHistory"\)/);
  assert.match(source, /MNBridge\.send\("retryImportHistory"/);
  assert.match(source, /仅重试失败项/);
  assert.match(source, /历史保存在本机，不记录墨墨 Token/);
  assert.match(source, /最多保留最近 20 次/);
  assert.match(source, /墨墨背诵接口只返回数量/);
});
