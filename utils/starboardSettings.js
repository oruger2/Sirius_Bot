const fsp = require('fs/promises');
const path = require('path');

const settingsPath = path.join(__dirname, '../json/starboardSettings.json');

function normalizeIdList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((id) => String(id).trim()).filter(Boolean))];
}

function normalizeEmoji(emoji) {
  return String(emoji || '').trim();
}

function normalizeRequiredCount(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 50);
}

async function loadStarboardSettings() {
  try {
    const raw = await fsp.readFile(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error.code === 'ENOENT') {
      await saveStarboardSettings({});
      return {};
    }
    console.error('[STARBOARD SETTINGS] 読み込み失敗', error);
    return {};
  }
}

async function saveStarboardSettings(settings) {
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  await fsp.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

async function getGuildStarboardSetting(guildId) {
  const settings = await loadStarboardSettings();
  const current = settings[guildId] || {};

  return {
    enabled: Boolean(current.enabled),
    targetChannelIds: normalizeIdList(current.targetChannelIds),
    emoji: normalizeEmoji(current.emoji),
    sendChannelId: String(current.sendChannelId || '').trim(),
    requiredCount: normalizeRequiredCount(current.requiredCount),
  };
}

async function setGuildStarboardSetting(guildId, nextValue) {
  const settings = await loadStarboardSettings();

  settings[guildId] = {
    enabled: Boolean(nextValue.enabled),
    targetChannelIds: normalizeIdList(nextValue.targetChannelIds),
    emoji: normalizeEmoji(nextValue.emoji),
    sendChannelId: String(nextValue.sendChannelId || '').trim(),
    requiredCount: normalizeRequiredCount(nextValue.requiredCount),
  };

  await saveStarboardSettings(settings);
  return settings[guildId];
}

module.exports = {
  getGuildStarboardSetting,
  setGuildStarboardSetting,
};
