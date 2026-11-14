import assert from "node:assert/strict";
import test from "node:test";

import { collectCardImports, extractExample } from "../web/src/domain/examples.mjs";

test("extractExample reads the first English sentence and final Chinese translation", () => {
  assert.deepEqual(
    extractExample({
      title: "light; lights; lit; lighting; lighter; lightest",
      text: "A kilogram too light or too heavy meant almost certain death.\n" +
        "n. 光；光线；灯；打火机；领悟；浅色；天窗\n" +
        "一公斤太轻或太重几乎意味着死亡。",
    }),
    {
      sentence: "A kilogram too light or too heavy meant almost certain death.",
      translation: "一公斤太轻或太重几乎意味着死亡。",
      matchedForm: "light",
      origin: "",
    },
  );
});

test("extractExample removes a title prefix returned by allNoteText", () => {
  assert.deepEqual(
    extractExample({
      title: "stage; stages; staged; staging",
      text: "stage; stages; staged;\nstaging\n[C] our species has reached the highest stage of evolution.\nC.我们的物种已经达到了进化的最高阶段。",
    }),
    {
      sentence: "[C] our species has reached the highest stage of evolution.",
      translation: "C.我们的物种已经达到了进化的最高阶段。",
      matchedForm: "stage",
      origin: "",
    },
  );
});

test("extractExample repairs a missing space between the word form and the next word", () => {
  assert.deepEqual(
    extractExample({
      title: "destroy; destroyed; destroying; destroys",
      text: "[C] the war had destroyedthe economies of most potential competitors.\n" +
        "C.战争摧毁了大多数潜在竞争对手的经济。\n" +
        "#2000EN #阅读 #Text1",
    }),
    {
      sentence: "[C] the war had destroyed the economies of most potential competitors.",
      translation: "C.战争摧毁了大多数潜在竞争对手的经济。",
      matchedForm: "destroyed",
      origin: "2000EN阅读Text1",
    },
  );
});

test("extractExample repairs a title form glued to an ordinary following word", () => {
  assert.deepEqual(
    extractExample({
      title: "sweep; sweeps; swept; sweeping",
      text: "Foreign-made cars were sweepingthrough the domestic market.\n" +
        "外国制造的汽车正涌入国内市场。",
    }),
    {
      sentence: "Foreign-made cars were sweeping through the domestic market.",
      translation: "外国制造的汽车正涌入国内市场。",
      matchedForm: "sweeping",
      origin: "",
    },
  );

  assert.deepEqual(
    extractExample({
      title: "destroy; destroys; destroyed; destroying",
      text: "The crisis destroyedmarkets across the region.\n" +
        "这场危机摧毁了整个地区的市场。",
    }),
    {
      sentence: "The crisis destroyed markets across the region.",
      translation: "这场危机摧毁了整个地区的市场。",
      matchedForm: "destroyed",
      origin: "",
    },
  );

});

test("extractExample does not split genuine words that merely start with the title form", () => {
  assert.equal(
    extractExample({
      title: "light; lights; lit; lighting",
      text: "Lightness is important in this design.\n轻盈对这个设计很重要。",
    }),
    null,
  );

  assert.equal(
    extractExample({
      title: "light; lights; lit; lighting",
      text: "Lightning struck the empty field.\n闪电击中了空旷的田野。",
    }),
    null,
  );
});

test("extractExample reads a restructuring card with a manually added translation", () => {
  assert.deepEqual(
    extractExample({
      title: "restructuring; restructurings",
      text: "[B]restructuringof industry.\n" +
        "🔊 [riːˈstrʌktʃərɪŋ]\n" +
        "n. 调整；改组；重建\n" +
        "v. 重组（restructure 的现在分词形式）\n" +
        "[B]产业重组。",
    }),
    {
      sentence: "[B]restructuring of industry.",
      translation: "[B]产业重组。",
      matchedForm: "restructuring",
      origin: "",
    },
  );
});

test("extractExample matches a title form inside a hyphenated compound", () => {
  assert.deepEqual(
    extractExample({
      title: "doubt; doubts; doubted; doubting",
      text: "Self-doubt has yielded to blind pride.\n" +
        "自我怀疑已经让位于盲目的骄傲。\n" +
        "#2000EN #阅读 #Text1",
    }),
    {
      sentence: "Self-doubt has yielded to blind pride.",
      translation: "自我怀疑已经让位于盲目的骄傲。",
      matchedForm: "doubt",
      origin: "2000EN阅读Text1",
    },
  );
});

test("extractExample prefers a sentence containing one of the title forms", () => {
  assert.deepEqual(
    extractExample({
      title: "abandon; abandoned; abandoning",
      text: "The plan was abandoned after one week.\n" +
        "This unrelated sentence should not be used.\n" +
        "这个计划一周后被放弃了。",
    }),
    {
      sentence: "The plan was abandoned after one week.",
      translation: "这个计划一周后被放弃了。",
      matchedForm: "abandoned",
      origin: "",
    },
  );
});

test("extractExample ignores trailing tags and uses them as the source", () => {
  assert.deepEqual(
    extractExample({
      title: "since; sensed",
      text: "Since OPEC agreed to supply-cuts in March, the price jumped.\n" +
        "自欧佩克 3 月份同意减产以来，价格上涨了。\n" +
        "#2000EN #阅读 #Text2",
    }),
    {
      sentence: "Since OPEC agreed to supply-cuts in March, the price jumped.",
      translation: "自欧佩克 3 月份同意减产以来，价格上涨了。",
      matchedForm: "since",
      origin: "2000EN阅读Text2",
    },
  );
});

test("extractExample skips an English sentence unrelated to the card word", () => {
  assert.equal(
    extractExample({
      title: "abandon; abandoned; abandoning",
      text: "This unrelated sentence should not be uploaded.\n这个句子的英文内容与卡片单词无关。",
    }),
    null,
  );
});

test("collectCardImports deduplicates words and examples", () => {
  assert.deepEqual(
    collectCardImports([
      { title: "make; made; making", text: "We make a plan every week.\n我们每周制定计划。" },
      { title: "make; made", text: "We make a plan every week.\n我们每周制定计划。" },
      { title: "3rd-place; third-place", text: "A sentence here.\n一个句子。" },
    ]),
    {
      lemmas: ["make"],
      skippedTitles: ["3rd-place; third-place"],
      examples: [{
        word: "make",
        lemma: "make",
        phrase: "We make a plan every week.",
        interpretation: "我们每周制定计划。",
        origin: "",
        title: "make; made; making",
      }],
      cardsWithoutExamples: [],
    },
  );
});
