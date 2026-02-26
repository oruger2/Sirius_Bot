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
  starboard: path.join(JSON_DIR, "starboardSettings.json"),
  starboardPosts: path.join(JSON_DIR, "starboardPosts.json"),
  warnings: path.join(JSON_DIR, "warnings.json"),
  rolePanels: path.join(JSON_DIR, "rolepanels.json"),
};

async function readJsonObject(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "").trim());
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    if (error instanceof SyntaxError) {
      const backupPath = `${filePath}.corrupt-${Date.now()}`;
      try {
        await fsp.copyFile(filePath, backupPath);
        await writeJsonObject(filePath, {});
        console.error(
          `[CLEANUP] 壊れたJSONを検出したため初期化しました: ${filePath} (backup: ${backupPath})`
        );
      } catch (recoveryError) {
        console.error(
          `[CLEANUP] 壊れたJSONの復旧に失敗: ${filePath}`,
          recoveryError
        );
      }
      return {};
    }
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

function removeChannelIdFromValue(value, channelId) {
  if (typeof value === "string") {
    return value === channelId ? "" : value;
  }

  if (Array.isArray(value)) {
    return normalizeIdList(value).filter((id) => id !== channelId);
  }

  return value;
}

function cleanupSpamChannelRefs(spamSetting, channelId) {
  if (!spamSetting || typeof spamSetting !== "object") return spamSetting;

  const next = { ...spamSetting };

  next.reportChannelId = removeChannelIdFromValue(next.reportChannelId, channelId) || "";
  next.ignoredChannelIds = removeChannelIdFromValue(next.ignoredChannelIds, channelId);

  // 互換: 旧キーが残っている場合も削除する
  if ("channelId" in next) {
    next.channelId = removeChannelIdFromValue(next.channelId, channelId);
  }
  if ("channelIds" in next) {
    next.channelIds = removeChannelIdFromValue(next.channelIds, channelId);
  }

  return next;
}

function shouldDeleteAutoReactionSetting(setting) {
  if (!setting || typeof setting !== "object") return true;
  const channelIds = normalizeIdList(setting.channelIds);
  const emojis = Array.isArray(setting.emojis)
    ? [...new Set(setting.emojis.map((emoji) => String(emoji).trim()).filter(Boolean))]
    : [];

  return !Boolean(setting.enabled) && channelIds.length === 0 && emojis.length === 0;
}

function shouldDeleteSpamSetting(setting) {
  if (!setting || typeof setting !== "object") return true;

  const reportChannelId = String(setting.reportChannelId || "").trim();
  const ignoredChannelIds = normalizeIdList(setting.ignoredChannelIds);
  const ignoredRoleIds = normalizeIdList(setting.ignoredRoleIds);

  return (
    !Boolean(setting.enabled) &&
    !reportChannelId &&
    ignoredChannelIds.length === 0 &&
    ignoredRoleIds.length === 0
  );
}

function shouldDeleteXpSetting(guildXpData) {
  if (!guildXpData || typeof guildXpData !== "object") return true;
  const settings = guildXpData.settings && typeof guildXpData.settings === "object"
    ? guildXpData.settings
    : {};
  const users = guildXpData.users && typeof guildXpData.users === "object"
    ? guildXpData.users
    : {};

  const notifyChannelId = String(settings.notifyChannelId || "").trim();
  const ignoredChannelIds = normalizeIdList(settings.ignoredChannelIds);
  const userCount = Object.keys(users).length;

  return !Boolean(settings.enabled) && !notifyChannelId && ignoredChannelIds.length === 0 && userCount === 0;
}

function shouldDeleteStarboardSetting(setting) {
  if (!setting || typeof setting !== "object") return true;

  const targetChannelIds = normalizeIdList(setting.targetChannelIds);
  const sendChannelId = String(setting.sendChannelId || "").trim();
  const emoji = String(setting.emoji || "").trim();

  return !Boolean(setting.enabled) && targetChannelIds.length === 0 && !sendChannelId && !emoji;
}

async function cleanupOnGuildDelete(guildId) {
  const fileNames = (await fsp.readdir(JSON_DIR))
    .filter((fileName) => fileName.endsWith(".json"));

  for (const fileName of fileNames) {
    const filePath = path.join(JSON_DIR, fileName);
    const data = await readJsonObject(filePath);
    let dirty = false;

    if (data[guildId] !== undefined) {
      delete data[guildId];
      dirty = true;
    }

    for (const [entryKey, value] of Object.entries(data)) {
      if (value?.guildId === guildId) {
        delete data[entryKey];
        dirty = true;
      }
    }

    if (dirty) {
      await writeJsonObject(filePath, data);
    }
  }
}

async function cleanupOnChannelDelete(guildId, channelId) {
  const joinSettings = await readJsonObject(FILES.join);
  if (joinSettings[guildId]?.channelId === channelId) {
    delete joinSettings[guildId];
    await writeJsonObject(FILES.join, joinSettings);
  }

  const leaveSettings = await readJsonObject(FILES.leave);
  if (leaveSettings[guildId]?.channelId === channelId) {
    delete leaveSettings[guildId];
    await writeJsonObject(FILES.leave, leaveSettings);
  }

  const autoReactionSettings = await readJsonObject(FILES.autoReaction);
  if (autoReactionSettings[guildId]) {
    autoReactionSettings[guildId].channelIds = normalizeIdList(
      autoReactionSettings[guildId].channelIds
    ).filter((id) => id !== channelId);

    if (shouldDeleteAutoReactionSetting(autoReactionSettings[guildId])) {
      delete autoReactionSettings[guildId];
    }

    await writeJsonObject(FILES.autoReaction, autoReactionSettings);
  }

  const spamSettings = await readJsonObject(FILES.spam);
  if (spamSettings[guildId]) {
    spamSettings[guildId] = cleanupSpamChannelRefs(spamSettings[guildId], channelId);

    if (shouldDeleteSpamSetting(spamSettings[guildId])) {
      delete spamSettings[guildId];
    }

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

    if (shouldDeleteXpSetting(xpData[guildId])) {
      delete xpData[guildId];
    }

    await writeJsonObject(FILES.xp, xpData);
  }

  const starboardSettings = await readJsonObject(FILES.starboard);
  if (starboardSettings[guildId]) {
    if (starboardSettings[guildId].sendChannelId === channelId) {
      starboardSettings[guildId].sendChannelId = "";
    }

    starboardSettings[guildId].targetChannelIds = normalizeIdList(
      starboardSettings[guildId].targetChannelIds
    ).filter((id) => id !== channelId);

    if (shouldDeleteStarboardSetting(starboardSettings[guildId])) {
      delete starboardSettings[guildId];
    }

    await writeJsonObject(FILES.starboard, starboardSettings);
  }

  const starboardPosts = await readJsonObject(FILES.starboardPosts);
  let starboardDirty = false;
  for (const [postKey, post] of Object.entries(starboardPosts)) {
    if (post?.guildId !== guildId) continue;
    if (post?.sourceChannelId === channelId || post?.starboardChannelId === channelId) {
      delete starboardPosts[postKey];
      starboardDirty = true;
    }
  }
  if (starboardDirty) {
    await writeJsonObject(FILES.starboardPosts, starboardPosts);
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

    if (shouldDeleteSpamSetting(spamSettings[guildId])) {
      delete spamSettings[guildId];
    }

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
  const starboardPosts = await readJsonObject(FILES.starboardPosts);
  let starboardDirty = false;
  for (const [postKey, post] of Object.entries(starboardPosts)) {
    if (post?.sourceMessageId === messageId || post?.starboardMessageId === messageId) {
      delete starboardPosts[postKey];
      starboardDirty = true;
    }
  }
  if (starboardDirty) {
    await writeJsonObject(FILES.starboardPosts, starboardPosts);
  }

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
