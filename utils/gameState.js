const fsp = require("fs/promises");
const path = require("path");

const gameStatePath = path.join(__dirname, "../json/gameState.json");

/**
 * ゲーム状態ファイルを読み込む
 */
async function loadGameState() {
  try {
    const raw = await fsp.readFile(gameStatePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { blackjack: {} };
    }
    console.error("[GAME_STATE] gameState.json の読み込みに失敗しました", error);
    return { blackjack: {} };
  }
}

/**
 * ゲーム状態ファイルを保存する
 */
async function saveGameState(data) {
  try {
    await fsp.writeFile(gameStatePath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("[GAME_STATE] gameState.json の保存に失敗しました", error);
  }
}

/**
 * ユーザーがブラックジャックをプレイ中か確認
 */
async function isUserPlayingBlackjack(userId) {
  const state = await loadGameState();
  return state.blackjack?.[userId] === true;
}

/**
 * ユーザーのブラックジャック開始状態を設定
 */
async function setUserPlayingBlackjack(userId, isPlaying) {
  const state = await loadGameState();
  if (!state.blackjack) {
    state.blackjack = {};
  }

  if (isPlaying) {
    state.blackjack[userId] = true;
  } else {
    delete state.blackjack[userId];
  }

  await saveGameState(state);
}

module.exports = {
  isUserPlayingBlackjack,
  setUserPlayingBlackjack,
};
