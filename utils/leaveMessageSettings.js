const fsp = require("fs/promises");
const path = require("path");

const settingsPath = path.join(__dirname, "../json/leaveMessageSettings.json");

async function loadLeaveSettings() {
  let raw;
  try {
    raw = await fsp.readFile(settingsPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      await saveLeaveSettings({});
      return {};
    }
    throw err;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[LEAVE SETTINGS] 読み込み失敗", error);
    return {};
  }
}

async function saveLeaveSettings(settings) {
  const dir = path.dirname(settingsPath);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

async function getGuildLeaveSetting(guildId) {
  const settings = await loadLeaveSettings();
  return settings[guildId] || { enabled: false, channelId: "", message: "" };
}

async function setGuildLeaveSetting(guildId, nextValue) {
  const settings = await loadLeaveSettings();
  settings[guildId] = {
    enabled: Boolean(nextValue.enabled),
    channelId: nextValue.channelId || "",
    message: nextValue.message || "",
  };
  await saveLeaveSettings(settings);
  return settings[guildId];
}

module.exports = {
  getGuildLeaveSetting,
  setGuildLeaveSetting,
};
