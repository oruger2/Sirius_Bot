const fsp = require("fs/promises");
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

async function loadAutoReactionSettings() {
  let raw;
  try {
    raw = await fsp.readFile(settingsPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      await saveAutoReactionSettings({});
      return {};
    }
    throw err;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[AUTO REACTION SETTINGS] 読み込み失敗", error);
    return {};
  }
}

async function saveAutoReactionSettings(settings) {
  const dir = path.dirname(settingsPath);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

async function getGuildAutoReactionSetting(guildId) {
  const settings = await loadAutoReactionSettings();
  const current = settings[guildId] || {};

  return {
    enabled: Boolean(current.enabled),
    channelIds: normalizeIdList(current.channelIds),
    emojis: normalizeEmojiList(current.emojis),
  };
}

async function setGuildAutoReactionSetting(guildId, nextValue) {
  const settings = await loadAutoReactionSettings();
  settings[guildId] = {
    enabled: Boolean(nextValue.enabled),
    channelIds: normalizeIdList(nextValue.channelIds),
    emojis: normalizeEmojiList(nextValue.emojis),
  };
  await saveAutoReactionSettings(settings);
  return settings[guildId];
}

module.exports = {
  getGuildAutoReactionSetting,
  setGuildAutoReactionSetting,
};