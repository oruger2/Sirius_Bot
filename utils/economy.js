const fs = require("fs/promises");
const path = require("path");

const ECONOMY_PATH = path.join(__dirname, "..", "../json/economy.json");

async function readEconomy() {
  try {
    const raw = await fs.readFile(ECONOMY_PATH, "utf8");
    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }

    return {};
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeEconomy(data) {
  await fs.writeFile(ECONOMY_PATH, JSON.stringify(data, null, 2), "utf8");
}

function createDefaultUser(userId) {
  return {
    userId,
    balance: 0,
    lastWorkAt: 0,
    username: null,
  };
}

async function getUserEconomy(userId) {
  const economy = await readEconomy();
  const user = economy[userId] || createDefaultUser(userId);

  return {
    userId,
    balance: Number.isFinite(user.balance) ? user.balance : 0,
    lastWorkAt: Number.isFinite(user.lastWorkAt) ? user.lastWorkAt : 0,
    username: typeof user.username === "string" ? user.username : null,
  };
}

async function updateUser(userId, updater) {
  const economy = await readEconomy();
  const current = economy[userId] || createDefaultUser(userId);
  const next = updater({
    userId,
    balance: Number.isFinite(current.balance) ? current.balance : 0,
    lastWorkAt: Number.isFinite(current.lastWorkAt) ? current.lastWorkAt : 0,
    username: typeof current.username === "string" ? current.username : null,
  });

  economy[userId] = {
    ...createDefaultUser(userId),
    ...next,
    userId,
  };

  await writeEconomy(economy);
  return economy[userId];
}

async function addBalance(userId, amount, username) {
  const normalized = Number.isFinite(amount) ? amount : 0;

  return updateUser(userId, (user) => ({
    ...user,
    balance: user.balance + normalized,
    username: typeof username === "string" && username.length > 0 ? username : user.username,
  }));
}

async function setLastWorkAt(userId, timestamp, username) {
  return updateUser(userId, (user) => ({
    ...user,
    lastWorkAt: Number.isFinite(timestamp) ? timestamp : user.lastWorkAt,
    username: typeof username === "string" && username.length > 0 ? username : user.username,
  }));
}

async function getRanking(limit = 10) {
  const economy = await readEconomy();

  return Object.entries(economy)
    .map(([userId, user]) => ({
      userId,
      balance: Number.isFinite(user?.balance) ? user.balance : 0,
      lastWorkAt: Number.isFinite(user?.lastWorkAt) ? user.lastWorkAt : 0,
      username: typeof user?.username === "string" ? user.username : null,
    }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}

module.exports = {
  getUserEconomy,
  addBalance,
  setLastWorkAt,
  getRanking,
};
