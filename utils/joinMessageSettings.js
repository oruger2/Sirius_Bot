const fsp = require("fs/promises");
const path = require("path");

const settingsPath = path.join(__dirname, "../json/joinMessageSettings.json");

async function loadJoinSettings() {
  let raw;
  try {
    raw = await fsp.readFile(settingsPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      await saveJoinSettings({});
      return {};
    }
    throw err;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[JOIN SETTINGS] 読み込み失敗", error);
    return {};
  }
}

async function saveJoinSettings(settings) {
  const dir = path.dirname(settingsPath);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

async function getGuildJoinSetting(guildId) {
  const settings = await loadJoinSettings();
  return settings[guildId] || { enabled: false, channelId: "", message: "" };
}

async function setGuildJoinSetting(guildId, nextValue) {
  const settings = await loadJoinSettings();
  settings[guildId] = {
    enabled: Boolean(nextValue.enabled),
    channelId: nextValue.channelId || "",
    message: nextValue.message || "",
  };
  await saveJoinSettings(settings);
  return settings[guildId];
}

module.exports = {
  getGuildJoinSetting,
  setGuildJoinSetting,
  loadJoinSettings,
};
