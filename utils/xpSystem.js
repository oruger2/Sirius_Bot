const fsp = require("fs/promises");
const path = require("path");

const dataPath = path.join(__dirname, "../json/xpSystem.json");
const MAX_LEVEL = 100;

async function readData() {
  let raw;
  try {
    raw = await fsp.readFile(dataPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      await writeData({});
      return {};
    }
    throw err;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[XP] データ読み込み失敗", error);
    return {};
  }
}

async function writeData(data) {
  const dir = path.dirname(dataPath);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(dataPath, JSON.stringify(data, null, 2), "utf8");
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

async function getGuildData(guildId) {
  const all = await readData();
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

async function saveGuildData(guildId, guildData) {
  const all = await readData();
  all[guildId] = guildData;
  await writeData(all);
}

async function getGuildXpSetting(guildId) {
  return (await getGuildData(guildId)).settings;
}

async function setGuildXpSetting(guildId, nextSetting) {
  const guildData = await getGuildData(guildId);
  guildData.settings = {
    enabled: Boolean(nextSetting.enabled),
    notifyChannelId: nextSetting.notifyChannelId || "",
    ignoredChannelIds: normalizeChannelIds(nextSetting.ignoredChannelIds),
  };
  await saveGuildData(guildId, guildData);
  return guildData.settings;
}

async function getUserXp(guildId, userId) {
  const guildData = await getGuildData(guildId);
  const xp = Math.max(0, Number.parseInt(guildData.users[userId]?.xp, 10) || 0);
  const levelInfo = calculateLevelFromXp(xp);

  return {
    userId,
    xp,
    level: levelInfo.level,
    ...levelInfo,
  };
}

async function setUserXp(guildId, userId, nextXp) {
  const guildData = await getGuildData(guildId);
  const xp = Math.max(0, Number.parseInt(nextXp, 10) || 0);
  guildData.users[userId] = { xp };
  await saveGuildData(guildId, guildData);

  return await getUserXp(guildId, userId);
}

async function addUserXp(guildId, userId, amount) {
  const current = await getUserXp(guildId, userId);
  const add = Math.max(0, Number.parseInt(amount, 10) || 0);
  const next = await setUserXp(guildId, userId, current.xp + add);

  return {
    before: current,
    after: next,
    gained: add,
    leveledUp: next.level > current.level,
  };
}

async function getGuildXpRanking(guildId, userIds = []) {
  const guildData = await getGuildData(guildId);
  const targetIds = Array.isArray(userIds) && userIds.length > 0
    ? [...new Set(userIds.map((id) => String(id)))]
    : Object.keys(guildData.users);

  return targetIds
    .map((userId) => {
      const xp = Math.max(0, Number.parseInt(guildData.users[userId]?.xp, 10) || 0);
      const levelInfo = calculateLevelFromXp(xp);
      return {
        userId,
        xp,
        level: levelInfo.level,
      };
    })
    .sort((a, b) => b.xp - a.xp || b.level - a.level || a.userId.localeCompare(b.userId));
}

module.exports = {
  MAX_LEVEL,
  calculateLevelFromXp,
  getGuildXpSetting,
  setGuildXpSetting,
  getUserXp,
  setUserXp,
  addUserXp,
  getGuildXpRanking,
};
