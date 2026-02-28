const fsp = require("fs/promises");
const path = require("path");

const settingsPath = path.join(__dirname, "../json/inviteLinkBlockSettings.json");

function normalizeIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

async function loadInviteLinkSettings() {
  let raw;
  try {
    raw = await fsp.readFile(settingsPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      await saveInviteLinkSettings({});
      return {};
    }
    throw err;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[INVITE LINK SETTINGS] 読み込み失敗", error);
    return {};
  }
}

async function saveInviteLinkSettings(settings) {
  const dir = path.dirname(settingsPath);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

async function getGuildInviteLinkSetting(guildId) {
  const settings = await loadInviteLinkSettings();
  const current = settings[guildId] || {};

  return {
    enabled: Boolean(current.enabled),
    allowedChannelIds: normalizeIds(current.allowedChannelIds),
    allowedRoleIds: normalizeIds(current.allowedRoleIds),
  };
}

async function setGuildInviteLinkSetting(guildId, nextValue) {
  const settings = await loadInviteLinkSettings();
  settings[guildId] = {
    enabled: Boolean(nextValue.enabled),
    allowedChannelIds: normalizeIds(nextValue.allowedChannelIds),
    allowedRoleIds: normalizeIds(nextValue.allowedRoleIds),
  };
  await saveInviteLinkSettings(settings);
  return settings[guildId];
}

module.exports = {
  getGuildInviteLinkSetting,
  setGuildInviteLinkSetting,
};
