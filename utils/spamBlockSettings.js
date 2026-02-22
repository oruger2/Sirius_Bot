const fs = require("fs");
const path = require("path");

const settingsPath = path.join(__dirname, "../json/spamBlockSettings.json");
const DEFAULT_DETECTION_WINDOW_SECONDS = 5;
const DEFAULT_MAX_MESSAGES = 5;
const DEFAULT_TIMEOUT_MINUTES = 10;

function toBoundedInteger(value, defaultValue, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return defaultValue;
  return Math.min(max, Math.max(min, number));
}

function normalizeIdList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((id) => String(id).trim()).filter(Boolean))];
}

function loadSpamSettings() {
  if (!fs.existsSync(settingsPath)) {
    saveSpamSettings({});
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[SPAM SETTINGS] 読み込み失敗", error);
    return {};
  }
}

function saveSpamSettings(settings) {
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

function getGuildSpamSetting(guildId) {
  const settings = loadSpamSettings();
  const current = settings[guildId] || {};

  return {
    enabled: Boolean(current.enabled),
    reportChannelId: current.reportChannelId || "",
    ignoredChannelIds: normalizeIdList(current.ignoredChannelIds),
    ignoredRoleIds: normalizeIdList(current.ignoredRoleIds),
    detectionWindowSeconds: toBoundedInteger(
      current.detectionWindowSeconds,
      DEFAULT_DETECTION_WINDOW_SECONDS,
      1,
      60
    ),
    maxMessages: toBoundedInteger(current.maxMessages, DEFAULT_MAX_MESSAGES, 2, 20),
    timeoutMinutes: toBoundedInteger(current.timeoutMinutes, DEFAULT_TIMEOUT_MINUTES, 1, 1440),
  };
}

function setGuildSpamSetting(guildId, nextValue) {
  const settings = loadSpamSettings();
  settings[guildId] = {
    enabled: Boolean(nextValue.enabled),
    reportChannelId: nextValue.reportChannelId || "",
    ignoredChannelIds: normalizeIdList(nextValue.ignoredChannelIds),
    ignoredRoleIds: normalizeIdList(nextValue.ignoredRoleIds),
    detectionWindowSeconds: toBoundedInteger(
      nextValue.detectionWindowSeconds,
      DEFAULT_DETECTION_WINDOW_SECONDS,
      1,
      60
    ),
    maxMessages: toBoundedInteger(nextValue.maxMessages, DEFAULT_MAX_MESSAGES, 2, 20),
    timeoutMinutes: toBoundedInteger(nextValue.timeoutMinutes, DEFAULT_TIMEOUT_MINUTES, 1, 1440),
  };
  saveSpamSettings(settings);
  return settings[guildId];
}

module.exports = {
  getGuildSpamSetting,
  setGuildSpamSetting,
};
