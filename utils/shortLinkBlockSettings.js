const fs = require("fs");
const path = require("path");

const settingsPath = path.join(__dirname, "../json/shortLinkBlockSettings.json");

function loadShortLinkSettings() {
  if (!fs.existsSync(settingsPath)) {
    saveShortLinkSettings({});
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[SHORTLINK SETTINGS] 読み込み失敗", error);
    return {};
  }
}

function saveShortLinkSettings(settings) {
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

function getGuildShortLinkSetting(guildId) {
  const settings = loadShortLinkSettings();
  const current = settings[guildId] || {};

  return {
    enabled: Boolean(current.enabled),
  };
}

function setGuildShortLinkSetting(guildId, nextValue) {
  const settings = loadShortLinkSettings();
  settings[guildId] = {
    enabled: Boolean(nextValue.enabled),
  };
  saveShortLinkSettings(settings);
  return settings[guildId];
}

module.exports = {
  getGuildShortLinkSetting,
  setGuildShortLinkSetting,
};
