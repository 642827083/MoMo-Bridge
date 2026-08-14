JSB.require("WebDevServerConfig");
JSB.require("MomoApi");
JSB.require("DeepSeekApi");
JSB.require("MomoSelection");
JSB.require("MomoImportHistory");
JSB.require("MomoReadingHistory");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("WebAddon");

JSB.newAddon = function (mainPath) {
  return createWebAddon(mainPath);
};
