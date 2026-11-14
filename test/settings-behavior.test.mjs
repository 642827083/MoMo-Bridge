import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/WebBridgeCommands.js", import.meta.url), "utf8");

function createSettingsRuntime(values = new Map(), nativeGlobals = {}) {
  const context = {
    ...nativeGlobals,
    NSUserDefaults: {
      standardUserDefaults() {
        return {
          objectForKey(key) { return values.get(key); },
          setObjectForKey(value, key) { values.set(key, value); },
        };
      },
    },
  };
  vm.runInNewContext(source, context);
  return { commands: context.__MN_WEB_BRIDGE_COMMANDS_GLOBAL__.commands, values };
}

test("Token help requests Safari and preserves the target page", () => {
  const opened = [];
  const { commands } = createSettingsRuntime(new Map(), {
    NSURL: { URLWithString(value) { return { value }; } },
    UIApplication: { sharedApplication() { return {
      openURL(url) { opened.push(url.value); return true; },
    }; } },
  });
  assert.equal(commands.openExternalURL({}, {
    url: "  https://open.maimemo.com/?source=bridge#/token  ", browser: "safari",
  }).opened, true);
  assert.deepEqual(opened, ["x-safari-https://open.maimemo.com/?source=bridge#/token"]);
  commands.openExternalURL({}, { url: "https://open.maimemo.com/#/" });
  assert.equal(opened[1], "https://open.maimemo.com/#/");
});

test("Safari help rejects other sites before contacting the system", () => {
  const { commands } = createSettingsRuntime(new Map(), {
    NSURL: { URLWithString() { assert.fail("Unexpected URL creation"); } },
  });
  for (const url of ["https://open.maimemo.com.evil.test/", "https://open.maimemo.com@evil.test/",
    "http://open.maimemo.com/", "x-safari-https://open.maimemo.com/", ""]) {
    assert.throws(() => commands.openExternalURL({}, { url, browser: "safari" }), /只允许打开墨墨开放平台地址/);
  }
});

test("Unsupported Safari scheme falls back to the documented HTTPS opener", () => {
  const opened = [];
  const { commands } = createSettingsRuntime(new Map(), {
    NSURL: { URLWithString(value) { return value; } },
    UIApplication: { sharedApplication() { return { openURL(url) { opened.push(url); return false; } }; } },
    MNUtil: { openURL(url) { opened.push(url); } },
  });
  assert.equal(commands.openExternalURL({}, { url: "https://open.maimemo.com/#/", browser: "safari" }).opened, true);
  assert.deepEqual(opened, ["x-safari-https://open.maimemo.com/#/", "https://open.maimemo.com/#/"]);
});

test("Failure of both browser routes is reported", () => {
  const opened = [];
  const { commands } = createSettingsRuntime(new Map(), {
    NSURL: { URLWithString(value) { return value; } },
    UIApplication: { sharedApplication() { return {
      openURL(url) { opened.push(url); return false; },
    }; } },
  });
  commands.saveMomoToken({}, { token: "keep-token" });
  assert.throws(() => commands.openExternalURL({}, {
    url: "https://open.maimemo.com/#/", browser: "safari",
  }), /无法打开外部浏览器/);
  assert.deepEqual(opened, ["x-safari-https://open.maimemo.com/#/", "https://open.maimemo.com/#/"]);
  assert.equal(commands.getSettings().token, "keep-token");
});

test("Token help supports MN Utils without UIKit and the native void opener", () => {
  for (const useUtils of [true, false]) {
    const opened = [];
    const openURL = (url) => { opened.push(url); };
    const { commands } = createSettingsRuntime(new Map(), {
      NSURL: { URLWithString(value) { return value; } },
      ...(useUtils ? { MNUtil: { openURL } } : { Application: { sharedInstance() { return { openURL }; } } }),
    });
    assert.equal(commands.openExternalURL({}, { url: "https://open.maimemo.com/#/", browser: "safari" }).opened, true);
    assert.deepEqual(opened, ["https://open.maimemo.com/#/"]);
  }
});

test("Token help reports unavailable native APIs and invalid native URLs", () => {
  const payload = { url: "https://open.maimemo.com/#/", browser: "safari" };
  for (const nativeGlobals of [{}, { NSURL: {} }, {
    NSURL: { URLWithString(value) { return value; } }, UIApplication: {},
  }, {
    NSURL: { URLWithString(value) { return value; } },
    UIApplication: { sharedApplication() { return {}; } },
  }]) {
    assert.throws(() => createSettingsRuntime(new Map(), nativeGlobals).commands.openExternalURL({}, payload),
      /当前环境不支持打开外部浏览器/);
  }
  const { commands } = createSettingsRuntime(new Map(), {
    NSURL: { URLWithString() { return null; } },
    UIApplication: { sharedApplication() { return { openURL() { assert.fail("Invalid URL opened"); } }; } },
  });
  assert.throws(() => commands.openExternalURL({}, payload), /墨墨开放平台地址无效/);
});

test("A saved account Token survives reopening and preference updates", () => {
  const { commands, values } = createSettingsRuntime();
  commands.saveSettings({}, {
    token: "legacy-token",
    bookId: "book-1",
    importOptions: { addExamples: true },
  });
  commands.saveMomoToken({}, { token: "  replacement-token  " });
  commands.saveSettings({}, {
    bookId: "book-1",
    readingOptions: { translation: false },
  });

  const reopened = createSettingsRuntime(values).commands.getSettings();
  assert.equal(reopened.token, "replacement-token");
  assert.equal(reopened.bookId, "book-1");
  assert.equal(reopened.importOptions.addExamples, true);
  assert.equal(reopened.readingOptions.translation, false);
});

test("Clearing the Token preserves other settings and later updates keep it cleared", () => {
  const { commands, values } = createSettingsRuntime();
  commands.saveSettings({}, { token: "old-token", bookId: "book-2", importOptions: { addStudy: true } });
  commands.saveMomoToken({}, { token: "" });
  commands.saveSettings({}, { bookId: "book-2", readingOptions: { length: "short" } });

  const reopened = createSettingsRuntime(values).commands.getSettings();
  assert.equal(reopened.token, "");
  assert.equal(reopened.bookId, "book-2");
  assert.equal(reopened.importOptions.addStudy, true);
  assert.equal(reopened.readingOptions.length, "short");
});

test("An invalid save request cannot erase an existing Token", () => {
  const { commands } = createSettingsRuntime();
  commands.saveMomoToken({}, { token: "keep-token" });
  for (const payload of [undefined, null, {}, { token: null }, { token: 42 }]) {
    assert.throws(() => commands.saveMomoToken({}, payload), /墨墨 Token 必须是文本/);
    assert.equal(commands.getSettings().token, "keep-token");
  }
});

test("A failed native write leaves the previous Token available", () => {
  const { commands, values } = createSettingsRuntime();
  commands.saveMomoToken({}, { token: "keep-token" });
  values.set = () => { throw new Error("storage unavailable"); };
  assert.throws(() => commands.saveMomoToken({}, { token: "replacement-token" }), /storage unavailable/);
  assert.equal(commands.getSettings().token, "keep-token");
});

test("Reading clipboard text is explicit and leaves saved credentials unchanged", () => {
  let reads = 0;
  const { commands } = createSettingsRuntime(new Map(), {
    MNUtil: {
      get clipboardText() {
        reads += 1;
        return "  Bearer example-pasted-token\n";
      },
    },
  });
  commands.saveMomoToken({}, { token: "existing-token" });
  assert.equal(reads, 0);
  assert.equal(commands.getMomoTokenClipboard().text, "Bearer example-pasted-token");
  assert.equal(reads, 1);
  assert.equal(commands.getSettings().token, "existing-token");
});

test("Empty or unavailable clipboard cannot erase saved credentials", () => {
  for (const clipboard of [undefined, null, "", " \n "]) {
    const { commands } = createSettingsRuntime(new Map(), {
      MNUtil: { get clipboardText() { return clipboard; } },
    });
    commands.saveMomoToken({}, { token: "existing-token" });
    assert.throws(() => commands.getMomoTokenClipboard(), /剪贴板没有文本/);
    assert.equal(commands.getSettings().token, "existing-token");
  }
  for (const nativeGlobals of [{}, { MNUtil: {} }, {
    MNUtil: { get clipboardText() { throw new Error("clipboard denied"); } },
  }]) {
    const { commands } = createSettingsRuntime(new Map(), nativeGlobals);
    commands.saveMomoToken({}, { token: "existing-token" });
    assert.throws(() => commands.getMomoTokenClipboard(), /安装并启用 MN Utils|clipboard denied/);
    assert.equal(commands.getSettings().token, "existing-token");
  }
});
