const fs = require("fs");
const path = require("path");

const settingsPath = path.join(__dirname, "../json/autoReactionSettings.json");

function normalizeIdList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((id) => String(id).trim()).filter(Boolean))];
}

function normalizeEmojiList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((emoji) => String(emoji).trim()).filter(Boolean))];
}

function loadAutoReactionSettings() {
  if (!fs.existsSync(settingsPath)) {
    saveAutoReactionSettings({});
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[AUTO REACTION SETTINGS] 読み込み失敗", error);
    return {};
  }
}

function saveAutoReactionSettings(settings) {
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

function getGuildAutoReactionSetting(guildId) {
  const settings = loadAutoReactionSettings();
  const current = settings[guildId] || {};

  return {
    enabled: Boolean(current.enabled),
    channelIds: normalizeIdList(current.channelIds),
    emojis: normalizeEmojiList(current.emojis),
  };
}

function setGuildAutoReactionSetting(guildId, nextValue) {
  const settings = loadAutoReactionSettings();
  settings[guildId] = {
    enabled: Boolean(nextValue.enabled),
    channelIds: normalizeIdList(nextValue.channelIds),
    emojis: normalizeEmojiList(nextValue.emojis),
  };
  saveAutoReactionSettings(settings);
  return settings[guildId];
}

module.exports = {
  getGuildAutoReactionSetting,
  setGuildAutoReactionSetting,
};
