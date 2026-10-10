import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = ((await readFile(new URL("../web/src/App.jsx", import.meta.url), "utf8"))
  + "\n" + await readFile(new URL("../web/src/components/ImportContent.jsx", import.meta.url), "utf8")
  + "\n" + await readFile(new URL("../web/src/components/HighlightToggle.jsx", import.meta.url), "utf8"))
  .replace(/\r\n/g, "\n");
const styleSource = await readFile(new URL("../web/src/styles.css", import.meta.url), "utf8");
const panelSource = await readFile(new URL("../src/WebPanelController.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const webBuildSource = await readFile(new URL("../scripts/web-build.js", import.meta.url), "utf8");
const addonManifest = JSON.parse(await readFile(new URL("../src/mnaddon.json", import.meta.url), "utf8"));
const packageSource = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("Panel keeps the product name without a duplicate web banner", () => {
  assert.match(panelSource, /controller\.titleLabel\.text = "MoMo Bridge"/);
  assert.doesNotMatch(panelSource, /__MN_WEB_PANEL_TITLE__/);
  assert.doesNotMatch(source, /MarginNote → 墨墨背单词/);
  assert.doesNotMatch(source, /单词书导入/);
  assert.doesNotMatch(source, /<h1>MoMo Bridge<\/h1>|className="app-heading"|className="status-dot"/);
  assert.match(htmlSource, /<title>MoMo Bridge<\/title>/);
  assert.match(webBuildSource, /<title>MoMo Bridge<\/title>/);
  assert.equal(addonManifest.title, "MoMo Bridge");
  assert.equal(addonManifest.addonid, "cn.marginnote.momo-vocabulary-import");
  assert.equal(packageSource.mnaddonFileName, "MoMo Bridge");
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

test("Import and AI reading preferences load and save through the native bridge", () => {
  assert.match(source, /settings\.importOptions/);
  assert.match(source, /settings\.readingOptions/);
  assert.match(source, /saveSettings\(bookId, \{ addWords: checked \}\)/);
  assert.match(source, /saveSettings\(bookId, \{ addExamples: checked \}\)/);
  assert.match(source, /saveSettings\(bookId, \{ articleType: value \}\)/);
  assert.match(source, /saveSettings\(bookId, \{ length: value \}\)/);
  assert.match(source, /saveSettings\(bookId, \{ translation: checked \}\)/);
  assert.match(source, /saveSettings\(bookId, \{ questions: checked \}\)/);
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
  assert.match(styleSource, /\.reading-history-item\s*\{[^}]*border-radius:\s*12px;/s);
  assert.match(styleSource, /\.reading-history-item > summary\s*\{[^}]*justify-content:\s*space-between;[^}]*padding:\s*14px;/s);
  assert.match(styleSource, /\.import-layout,\s*\n\s*\.reading-layout\s*\{[^}]*padding:\s*18px;/s);
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
  assert.match(source, /暂停生成/);
  assert.match(source, /pauseReadingGeneration/);
  assert.match(source, /readingQuestionsEnabled/);
  assert.match(source, /同时生成阅读题/);
  assert.doesNotMatch(source, /会额外调用一次 AI/);
  assert.match(source, /id="reading-translation"/);
  assert.match(source, /id="reading-questions"/);
  assert.match(source, /高亮词汇/);
  assert.match(source, /aria-pressed=\{active\}/);
  assert.match(source, /<ReadingVocabulary summary=\{readingWordSummary\(entry\)\} active=\{historyHighlightState\[entry.id\] !== false\}/);
  assert.match(source, /显示本段翻译/);
  assert.match(source, /显示全文翻译/);
  assert.match(source, /DEFAULT_READING_ARTICLE_TYPE = "postgraduate2"/);
  assert.doesNotMatch(source, /建立卡片|createAiReadingCards|readingCards|ArticleActionMenu/);
  assert.doesNotMatch(source, /复制英文|复制中英对照|copyReadingContent|copyReadingQuestions/);
  assert.match(source, /已覆盖单词/);
  assert.match(source, /待使用单词/);
  assert.match(styleSource, /\.reading-layout/);
  assert.match(styleSource, /\.reading-article-body/);
  assert.match(styleSource, /\.reading-controls\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(styleSource, /\.reading-reading-options\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(source, /function renderCurrentReadingArticle\(\)/);
  assert.match(source, /renderCurrentReadingArticle\(\)/);
  assert.match(source, /readingRightView/);
  assert.match(source, /className=\{`app-shell\$\{activePage === "reading" \? " reading-page-shell" : activePage === "import" \? " import-page-shell" : ""\}`\}/);
  assert.match(source, /本次阅读/);
  assert.match(source, /阅读历史/);
  assert.match(styleSource, /\.reading-view-tabs\s*\{/);
  assert.match(styleSource, /\.app-shell\s*\{[^}]*height:\s*100vh;[^}]*overflow:\s*hidden/s);
  assert.match(styleSource, /\.page-content\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(styleSource, /\.reading-page-shell \.reading-layout\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0/s);
  assert.match(styleSource, /\.reading-page-shell \.reading-settings-body,\s*\.reading-page-shell \.reading-history-card,[^{]*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain/s);
  assert.match(styleSource, /\.reading-page-shell \.reading-view-tabs\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0/s);
  assert.doesNotMatch(source, /reading-generation-action/);
  assert.doesNotMatch(source, /reading-pause-button/);
  assert.match(styleSource, /\.reading-word-highlight/);
  assert.match(styleSource, /\.reading-heading-highlight-option/);
  assert.match(styleSource, /\.reading-vocabulary-row/);
  assert.match(styleSource, /\.reading-action-button\s*\{[^}]*width:\s*100%/s);
  assert.doesNotMatch(styleSource, /\.reading-actions \.reading-action-button\s*\{/);
  assert.match(styleSource, /\.reading-article-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(styleSource, /\.reading-article-heading\s*\{[^}]*align-items:\s*flex-end/s);
  assert.ok(
    source.indexOf('<section className="reading-questions"')
      > source.indexOf('<section className="reading-history-card"'),
    "阅读理解题应位于右侧栏的阅读历史之前",
  );
  assert.match(styleSource, /\.reading-paragraph-translation/);
  assert.match(styleSource, /\.reading-history-translation/);
  assert.match(styleSource, /\.reading-article-paragraphs,\s*\.reading-history-paragraphs\s*\{[^}]*gap:\s*14px/s);
  assert.match(styleSource, /\.reading-history-paragraphs\s*\{[^}]*margin-top:\s*13px/s);
  assert.match(styleSource, /\.reading-history-translation\s*\{[^}]*margin-top:\s*8px;[^}]*padding:\s*8px 10px;[^}]*border-left:\s*3px solid var\(--brand\);[^}]*font-size:\s*12px;[^}]*line-height:\s*1\.6/s);
  assert.match(styleSource, /\.reading-history-translation > summary\s*\{[^}]*font-size:\s*11px/s);
  assert.match(styleSource, /\.reading-paragraph-translation > summary,\s*\.reading-history-translation > summary\s*\{[^}]*display:\s*flex;[^}]*gap:\s*0;[^}]*justify-content:\s*flex-start/s);
  assert.doesNotMatch(styleSource, /\.reading-paragraph-translation > summary::before/);
  assert.doesNotMatch(styleSource, /\.reading-history-translation > summary::before/);
  assert.match(source, /<details className="reading-history-translation">\s*<summary>显示本段翻译<\/summary>\s*<p>\{paragraph\.translation\}<\/p>/s);
  assert.doesNotMatch(source, /<small>\{paragraph\.translation\}<\/small>/);
  assert.match(styleSource, /\.reading-history-content \.reading-history-translation p\s*\{[^}]*margin:\s*6px 0 0;[^}]*font-size:\s*12px;[^}]*line-height:\s*1\.6/s);
  assert.doesNotMatch(styleSource, /\.reading-history-card > \.history-heading\s*\{[^}]*border-top:/s);
  assert.match(source, /className="history-empty reading-history-empty">生成文章后/);
  assert.match(styleSource, /\.reading-history-empty\s*\{[^}]*padding:\s*0;[^}]*border:\s*0/s);
  assert.match(styleSource, /\.reading-history-paragraph > p\s*\{[^}]*margin:\s*0;/s);
  assert.match(styleSource, /\.ai-actions button\s*{[^}]*width:\s*104px/s);
  assert.match(styleSource, /\.ai-actions \.primary-action\s*{[^}]*width:\s*104px/s);
});

test("AI 阅读直接显示两个重新生成按钮，选项展开、答案收起", () => {
  assert.match(source, /const READING_QUESTION_COUNT = 4/);
  assert.match(source, /const \[readingQuestionsBusy, setReadingQuestionsBusy\]/);
  assert.match(source, /async function generateReadingQuestions\(\)/);
  assert.match(source, /MNBridge\.send\("generateReadingQuestions"/);
  assert.match(source, /生成阅读题/);
  assert.match(source, /重新生成阅读题/);
  assert.doesNotMatch(source, /MNBridge\.send\("createAiReadingCards"/);
  assert.match(source, /查看答案与解析/);
  assert.match(source, /className="reading-questions"/);
  assert.doesNotMatch(source, /reading-more-actions/);
  assert.match(source, /手动生成阅读题|生成阅读题/);
  assert.match(source, /entry\.questions\?\.length/);
  assert.match(source, /renderReadingArticleActions\(entry, true\)/);
  assert.doesNotMatch(source, /复制阅读题|readingBilingualText/);
  assert.match(source, /<div className="reading-history-question"/);
  assert.doesNotMatch(source, /<details className="reading-history-question"/);
  assert.match(styleSource, /\.reading-question-item\s*\{/);
  assert.match(styleSource, /\.reading-answer-details\s*\{/);
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
  assert.equal((source.match(/type="checkbox"/g) || []).length, 6);
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

test("Study help opens below the compact row and wraps within the panel", () => {
  assert.match(styleSource, /\.option-info p\s*{[^}]*left:\s*0/s);
  assert.match(styleSource, /\.option-info p\s*{[^}]*top:\s*calc\(100% \+ 6px\)/s);
  assert.match(styleSource, /\.option-info p\s*{[^}]*width:\s*100%/s);
  assert.match(styleSource, /\.option-info p\s*{[^}]*max-width:\s*320px/s);
  assert.match(styleSource, /\.option-info-line\s*{[^}]*display:\s*block/s);
  assert.match(styleSource, /\.option-info-line\s*{[^}]*white-space:\s*normal/s);
  assert.equal((source.match(/className="option-info-line"/g) || []).length, 4);
});

test("Example import shows a subordinate duration notice only when selected", () => {
  assert.match(source, /\{addExamples \? \(/);
  assert.match(source, /className="option-guidance example-duration-note"/);
  assert.match(source, /例句较多时会自动分批上传，所需时间通常比只添加单词更长/);
});

test("Study import keeps its limit in help and the switch on the right", () => {
  assert.doesNotMatch(source, /className="option-guidance study-limit-note"/);
  assert.match(source, /添加背诵会占用墨墨账号的单词上限，达到上限后将无法继续添加/);
  assert.match(styleSource, /\.example-duration-note\s*{[^}]*align-items:\s*center/s);
  assert.match(styleSource, /\.study-advance-control\s*{[^}]*align-items:\s*center/s);
  assert.match(styleSource, /\.study-advance-option\s*{[^}]*margin-left:\s*auto/s);
});

test("Import UI distinguishes existing words from example results", () => {
  assert.match(source, /label: "单词"/);
  assert.match(source, /label: "例句"/);
  assert.match(source, /<th scope="col">成功<\/th>/);
  assert.match(source, /<th scope="col">已存在<\/th>/);
  assert.match(source, /<th scope="col">失败<\/th>/);
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
  assert.match(source, /每批最多 \{maxExamplesPerImport\} 条/);
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
  assert.match(source, /最多保留最近 10 次/);
  assert.match(source, /墨墨背诵接口只返回数量/);
});
