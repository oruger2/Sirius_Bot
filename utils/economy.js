const fs = require("fs");
const path = require("path");

const economyPath = path.join(__dirname, "../json/economy.json");

function loadEconomy() {
  if (!fs.existsSync(economyPath)) {
    saveEconomy({});
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(economyPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[ECONOMY] 読み込み失敗", error);
    return {};
  }
}

function saveEconomy(data) {
  const dir = path.dirname(economyPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(economyPath, JSON.stringify(data, null, 2), "utf8");
}

function getUserEconomy(userId) {
  const data = loadEconomy();
  const user = data[userId] || {};

  return {
    balance: Number.isFinite(user.balance) ? Math.floor(user.balance) : 0,
    lastWorkAt: Number.isFinite(user.lastWorkAt) ? user.lastWorkAt : 0,
  };
}

function setUserEconomy(userId, nextValue) {
  const data = loadEconomy();
  data[userId] = {
    balance: Math.max(0, Math.floor(nextValue.balance || 0)),
    lastWorkAt: Number.isFinite(nextValue.lastWorkAt) ? nextValue.lastWorkAt : 0,
  };
  saveEconomy(data);
  return data[userId];
}

function addBalance(userId, amount) {
  const current = getUserEconomy(userId);
  const next = {
    ...current,
    balance: Math.max(0, current.balance + Math.floor(amount)),
  };

  return setUserEconomy(userId, next);
}

function setLastWorkAt(userId, timestamp) {
  const current = getUserEconomy(userId);
  return setUserEconomy(userId, {
    ...current,
    lastWorkAt: timestamp,
  });
}

function getRanking(limit = 10) {
  const data = loadEconomy();

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
