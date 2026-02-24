const fsp = require("fs/promises");
const path = require("path");

const economyPath = path.join(__dirname, "../json/economy.json");

function sanitizeEconomyJson(raw) {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
    .trim();
}

async function backupBrokenEconomy(raw) {
  const dir = path.dirname(economyPath);
  const backupName = `economy.broken.${Date.now()}.json`;
  const backupPath = path.join(dir, backupName);
  await fsp.writeFile(backupPath, raw, "utf8");
  console.warn(`[ECONOMY] 壊れたJSONを退避しました: ${backupPath}`);
}

async function loadEconomy() {
  let raw;
  try {
    raw = await fsp.readFile(economyPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      await saveEconomy({});
      return {};
    }
    throw err;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[ECONOMY] 読み込み失敗", error);

    const sanitized = sanitizeEconomyJson(raw);

    if (!sanitized) {
      await backupBrokenEconomy(raw);
      return {};
    }

    try {
      const repaired = JSON.parse(sanitized);
      if (!repaired || typeof repaired !== "object") {
        await backupBrokenEconomy(raw);
        return {};
      }

      await saveEconomy(repaired);
      console.warn("[ECONOMY] JSONを自動修復しました");
      return repaired;
    } catch (repairError) {
      console.error("[ECONOMY] 自動修復失敗", repairError);
      await backupBrokenEconomy(raw);
      return {};
    }
  }
}

async function saveEconomy(data) {
  const dir = path.dirname(economyPath);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(economyPath, JSON.stringify(data, null, 2), "utf8");
}

async function getUserEconomy(userId) {
  const data = await loadEconomy();
  const user = data[userId] || {};

  return {
    balance: Number.isFinite(user.balance) ? Math.floor(user.balance) : 0,
    lastWorkAt: Number.isFinite(user.lastWorkAt) ? user.lastWorkAt : 0,
  };
}

async function setUserEconomy(userId, nextValue) {
  const data = await loadEconomy();
  data[userId] = {
    balance: Math.max(0, Math.floor(nextValue.balance || 0)),
    lastWorkAt: Number.isFinite(nextValue.lastWorkAt) ? nextValue.lastWorkAt : 0,
  };
  await saveEconomy(data);
  return data[userId];
}

async function addBalance(userId, amount) {
  const current = await getUserEconomy(userId);
  const next = {
    ...current,
    balance: Math.max(0, current.balance + Math.floor(amount)),
  };

  return await setUserEconomy(userId, next);
}

async function setLastWorkAt(userId, timestamp) {
  const current = await getUserEconomy(userId);
  return await setUserEconomy(userId, {
    ...current,
    lastWorkAt: timestamp,
  });
}

async function getRanking(limit = 10) {
  const data = await loadEconomy();

  return Object.entries(data)
    .map(([userId, value]) => ({
      userId,
      balance: Number.isFinite(value.balance) ? Math.floor(value.balance) : 0,
    }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}

module.exports = {
  getUserEconomy,
  setUserEconomy,
  addBalance,
  setLastWorkAt,
  getRanking,
};
