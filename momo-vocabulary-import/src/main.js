JSB.require("WebDevServerConfig");
JSB.require("MomoApi");
JSB.require("MomoSelection");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("WebAddon");

JSB.newAddon = function (mainPath) {
  return createWebAddon(mainPath);
};
