const fsp = require("fs/promises");
const path = require("path");

const JSON_DIR = path.join(__dirname, "../json");

const FILES = {
  join: path.join(JSON_DIR, "joinMessageSettings.json"),
  leave: path.join(JSON_DIR, "leaveMessageSettings.json"),
  autoReaction: path.join(JSON_DIR, "autoReactionSettings.json"),
  shortLink: path.join(JSON_DIR, "shortLinkBlockSettings.json"),
  spam: path.join(JSON_DIR, "spamBlockSettings.json"),
  xp: path.join(JSON_DIR, "xpSystem.json"),
  warnings: path.join(JSON_DIR, "warnings.json"),
  rolePanels: path.join(JSON_DIR, "rolepanels.json"),
};

async function readJsonObject(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    console.error(`[CLEANUP] JSON読み込み失敗: ${filePath}`, error);
    return {};
  }
}

async function writeJsonObject(filePath, data) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeIdList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((id) => String(id).trim()).filter(Boolean))];
}

async function cleanupOnGuildDelete(guildId) {
  const guildScopedFiles = [
    FILES.join,
    FILES.leave,
    FILES.autoReaction,
    FILES.shortLink,
    FILES.spam,
    FILES.xp,
    FILES.warnings,
  ];

  for (const filePath of guildScopedFiles) {
    const data = await readJsonObject(filePath);
    if (data[guildId] === undefined) continue;

    delete data[guildId];
    await writeJsonObject(filePath, data);
  }

  const panels = await readJsonObject(FILES.rolePanels);
  let dirty = false;
  for (const [messageId, panel] of Object.entries(panels)) {
    if (panel?.guildId === guildId) {
      delete panels[messageId];
      dirty = true;
    }
  }
  if (dirty) {
    await writeJsonObject(FILES.rolePanels, panels);
  }
}

async function cleanupOnChannelDelete(guildId, channelId) {
  const joinSettings = await readJsonObject(FILES.join);
  if (joinSettings[guildId]?.channelId === channelId) {
    joinSettings[guildId].channelId = "";
    await writeJsonObject(FILES.join, joinSettings);
  }

  const leaveSettings = await readJsonObject(FILES.leave);
  if (leaveSettings[guildId]?.channelId === channelId) {
    leaveSettings[guildId].channelId = "";
    await writeJsonObject(FILES.leave, leaveSettings);
  }

  const autoReactionSettings = await readJsonObject(FILES.autoReaction);
  if (autoReactionSettings[guildId]) {
    autoReactionSettings[guildId].channelIds = normalizeIdList(
      autoReactionSettings[guildId].channelIds
    ).filter((id) => id !== channelId);
    await writeJsonObject(FILES.autoReaction, autoReactionSettings);
  }

  const spamSettings = await readJsonObject(FILES.spam);
  if (spamSettings[guildId]) {
    if (spamSettings[guildId].reportChannelId === channelId) {
      spamSettings[guildId].reportChannelId = "";
    }
    spamSettings[guildId].ignoredChannelIds = normalizeIdList(
      spamSettings[guildId].ignoredChannelIds
    ).filter((id) => id !== channelId);

    await writeJsonObject(FILES.spam, spamSettings);
  }

  const xpData = await readJsonObject(FILES.xp);
  if (xpData[guildId]?.settings) {
    if (xpData[guildId].settings.notifyChannelId === channelId) {
      xpData[guildId].settings.notifyChannelId = "";
    }
    xpData[guildId].settings.ignoredChannelIds = normalizeIdList(
      xpData[guildId].settings.ignoredChannelIds
    ).filter((id) => id !== channelId);

    await writeJsonObject(FILES.xp, xpData);
  }

  const panels = await readJsonObject(FILES.rolePanels);
  let dirty = false;
  for (const [messageId, panel] of Object.entries(panels)) {
    if (panel?.channelId === channelId) {
      delete panels[messageId];
      dirty = true;
    }
  }
  if (dirty) {
    await writeJsonObject(FILES.rolePanels, panels);
  }
}

async function cleanupOnRoleDelete(guildId, roleId) {
  const spamSettings = await readJsonObject(FILES.spam);
  if (spamSettings[guildId]) {
    spamSettings[guildId].ignoredRoleIds = normalizeIdList(
      spamSettings[guildId].ignoredRoleIds
    ).filter((id) => id !== roleId);

    await writeJsonObject(FILES.spam, spamSettings);
  }

  const panels = await readJsonObject(FILES.rolePanels);
  let dirty = false;

  for (const [messageId, panel] of Object.entries(panels)) {
    if (!panel?.roles || typeof panel.roles !== "object") continue;

    for (const [emojiKey, targetRoleId] of Object.entries(panel.roles)) {
      if (String(targetRoleId) === roleId) {
        delete panel.roles[emojiKey];
        dirty = true;
      }
    }

    if (Object.keys(panel.roles).length === 0) {
      delete panels[messageId];
      dirty = true;
    }
  }

  if (dirty) {
    await writeJsonObject(FILES.rolePanels, panels);
  }
}

async function cleanupOnMessageDelete(messageId) {
  const panels = await readJsonObject(FILES.rolePanels);
  if (panels[messageId] === undefined) return;

  delete panels[messageId];
  await writeJsonObject(FILES.rolePanels, panels);
}

module.exports = {
  cleanupOnGuildDelete,
  cleanupOnChannelDelete,
  cleanupOnRoleDelete,
  cleanupOnMessageDelete,
};
