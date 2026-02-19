const fs = require("fs");
const path = require("path");

const settingsPath = path.join(__dirname, "../json/joinMessageSettings.json");

function loadJoinSettings() {
  if (!fs.existsSync(settingsPath)) {
    saveJoinSettings({});
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[JOIN SETTINGS] 読み込み失敗", error);
    return {};
  }
}

function saveJoinSettings(settings) {
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

function getGuildJoinSetting(guildId) {
  const settings = loadJoinSettings();
  return settings[guildId] || { enabled: false, channelId: "", message: "" };
}

function setGuildJoinSetting(guildId, nextValue) {
  const settings = loadJoinSettings();
  settings[guildId] = {
    enabled: Boolean(nextValue.enabled),
    channelId: nextValue.channelId || "",
    message: nextValue.message || "",
  };
  saveJoinSettings(settings);
  return settings[guildId];
}

module.exports = {
  getGuildJoinSetting,
  setGuildJoinSetting,
  loadJoinSettings,
};