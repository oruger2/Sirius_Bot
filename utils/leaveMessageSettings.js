const fs = require("fs");
const path = require("path");

const settingsPath = path.join(__dirname, "../json/leaveMessageSettings.json");

function loadLeaveSettings() {
  if (!fs.existsSync(settingsPath)) {
    saveLeaveSettings({});
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[LEAVE SETTINGS] 読み込み失敗", error);
    return {};
  }
}

function saveLeaveSettings(settings) {
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

function getGuildLeaveSetting(guildId) {
  const settings = loadLeaveSettings();
  return settings[guildId] || { enabled: false, channelId: "", message: "" };
}

function setGuildLeaveSetting(guildId, nextValue) {
  const settings = loadLeaveSettings();
  settings[guildId] = {
    enabled: Boolean(nextValue.enabled),
    channelId: nextValue.channelId || "",
    message: nextValue.message || "",
  };
  saveLeaveSettings(settings);
  return settings[guildId];
}

module.exports = {
  getGuildLeaveSetting,
  setGuildLeaveSetting,
};