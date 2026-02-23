const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../json/xpSystem.json");
const MAX_LEVEL = 100;

function readData() {
  if (!fs.existsSync(dataPath)) {
    writeData({});
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[XP] データ読み込み失敗", error);
    return {};
  }
}

function writeData(data) {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeChannelIds(channelIds) {
  if (!Array.isArray(channelIds)) return [];
  return [...new Set(channelIds.map((id) => String(id).trim()).filter(Boolean))];
}

function calculateLevelFromXp(xp) {
  const safeXp = Math.max(0, Number.parseInt(xp, 10) || 0);

  if (safeXp < 1) {
    return {
      level: 0,
      currentLevelXp: 0,
      nextLevelXp: 1,
      progressXp: safeXp,
      neededXp: 1,
      maxReached: false,
    };
  }

  let level = 1;
  let threshold = 100; // Lv2 到達XP

  while (level < MAX_LEVEL && safeXp >= threshold) {
    level += 1;
    threshold += level * 100;
  }

  if (level >= MAX_LEVEL) {
    return {
      level: MAX_LEVEL,
      currentLevelXp: 0,
      nextLevelXp: 0,
      progressXp: 0,
      neededXp: 0,
      maxReached: true,
    };
  }

  const previousThreshold = threshold - level * 100;

  return {
    level,
    currentLevelXp: previousThreshold,
    nextLevelXp: threshold,
    progressXp: safeXp - previousThreshold,
    neededXp: threshold - safeXp,
    maxReached: false,
  };
}

function getGuildData(guildId) {
  const all = readData();
  const guild = all[guildId] || {};
  const settings = guild.settings || {};

  return {
    settings: {
      enabled: Boolean(settings.enabled),
      notifyChannelId: settings.notifyChannelId || "",
      ignoredChannelIds: normalizeChannelIds(settings.ignoredChannelIds),
    },
    users: guild.users && typeof guild.users === "object" ? guild.users : {},
  };
}

function saveGuildData(guildId, guildData) {
  const all = readData();
  all[guildId] = guildData;
  writeData(all);
}

function getGuildXpSetting(guildId) {
  return getGuildData(guildId).settings;
}

function setGuildXpSetting(guildId, nextSetting) {
  const guildData = getGuildData(guildId);
  guildData.settings = {
    enabled: Boolean(nextSetting.enabled),
    notifyChannelId: nextSetting.notifyChannelId || "",
    ignoredChannelIds: normalizeChannelIds(nextSetting.ignoredChannelIds),
  };
  saveGuildData(guildId, guildData);
  return guildData.settings;
}

function getUserXp(guildId, userId) {
  const guildData = getGuildData(guildId);
  const xp = Math.max(0, Number.parseInt(guildData.users[userId]?.xp, 10) || 0);
  const levelInfo = calculateLevelFromXp(xp);

  return {
    userId,
    xp,
    level: levelInfo.level,
    ...levelInfo,
  };
}

function setUserXp(guildId, userId, nextXp) {
  const guildData = getGuildData(guildId);
  const xp = Math.max(0, Number.parseInt(nextXp, 10) || 0);
  guildData.users[userId] = { xp };
  saveGuildData(guildId, guildData);

  return getUserXp(guildId, userId);
}

function addUserXp(guildId, userId, amount) {
  const current = getUserXp(guildId, userId);
  const add = Math.max(0, Number.parseInt(amount, 10) || 0);
  const next = setUserXp(guildId, userId, current.xp + add);

  return {
    before: current,
    after: next,
    gained: add,
    leveledUp: next.level > current.level,
  };
}

module.exports = {
  MAX_LEVEL,
  calculateLevelFromXp,
  getGuildXpSetting,
  setGuildXpSetting,
  getUserXp,
  setUserXp,
  addUserXp,
};
