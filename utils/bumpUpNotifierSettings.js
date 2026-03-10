const fsp = require("fs/promises");
const path = require("path");

const settingsPath = path.join(__dirname, "../json/bumpUpNotifierSettings.json");

function normalizeId(value) {
  const id = String(value || "").trim();
  return id || "";
}

async function loadSettings() {
  let raw;
  try {
    raw = await fsp.readFile(settingsPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      await saveSettings({});
      return {};
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[BUMP/UP SETTINGS] 読み込み失敗", error);
    return {};
  }
}

async function saveSettings(settings) {
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  await fsp.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

async function getGuildBumpUpNotifierSetting(guildId) {
  const settings = await loadSettings();
  const current = settings[guildId] || {};

  return {
    enabled: Boolean(current.enabled),
    notifyChannelId: normalizeId(current.notifyChannelId),
    bumpMentionRoleId: normalizeId(current.bumpMentionRoleId),
    upMentionRoleId: normalizeId(current.upMentionRoleId),
  };
}

async function setGuildBumpUpNotifierSetting(guildId, nextValue) {
  const settings = await loadSettings();
  settings[guildId] = {
    enabled: Boolean(nextValue.enabled),
    notifyChannelId: normalizeId(nextValue.notifyChannelId),
    bumpMentionRoleId: normalizeId(nextValue.bumpMentionRoleId),
    upMentionRoleId: normalizeId(nextValue.upMentionRoleId),
  };

  await saveSettings(settings);
  return settings[guildId];
}

module.exports = {
  getGuildBumpUpNotifierSetting,
  setGuildBumpUpNotifierSetting,
};
