const fsp = require("fs/promises");
const path = require("path");

const settingsPath = path.join(__dirname, "../json/shortLinkBlockSettings.json");

async function loadShortLinkSettings() {
  let raw;
  try {
    raw = await fsp.readFile(settingsPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      await saveShortLinkSettings({});
      return {};
    }
    throw err;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[SHORTLINK SETTINGS] 読み込み失敗", error);
    return {};
  }
}

async function saveShortLinkSettings(settings) {
  const dir = path.dirname(settingsPath);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

async function getGuildShortLinkSetting(guildId) {
  const settings = await loadShortLinkSettings();
  const current = settings[guildId] || {};

  return {
    enabled: Boolean(current.enabled),
  };
}

async function setGuildShortLinkSetting(guildId, nextValue) {
  const settings = await loadShortLinkSettings();
  settings[guildId] = {
    enabled: Boolean(nextValue.enabled),
  };
  await saveShortLinkSettings(settings);
  return settings[guildId];
}

module.exports = {
  getGuildShortLinkSetting,
  setGuildShortLinkSetting,
};
