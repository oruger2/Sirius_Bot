let voiceLib = null;
let voiceLibError = null;

function getVoiceLib() {
  if (voiceLib || voiceLibError) return voiceLib;

  try {
    voiceLib = require("@discordjs/voice");
    return voiceLib;
  } catch (error) {
    voiceLibError = error;
    return null;
  }
}

const sessions = new Map();

function cleanupSession(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;

  session.queue.length = 0;
  session.player.stop(true);
  session.connection.destroy();
  sessions.delete(guildId);
}

function setupPlayer(guildId, player, AudioPlayerStatus) {
  player.on(AudioPlayerStatus.Idle, () => {
    const session = sessions.get(guildId);
    if (!session) return;
    void playNext(guildId);
  });

  player.on("error", (error) => {
    console.error("[VC_READ] Audio player error:", error);
    void playNext(guildId);
  });
}

function setupConnection(guildId, connection, VoiceConnectionStatus, entersState) {
  connection.on("error", (error) => {
    console.error("[VC_READ] Voice connection error:", error);
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      cleanupSession(guildId);
    }
  });
}

function startSession({ guildId, voiceChannel, textChannelId, guildVoiceAdapterCreator }) {
  const lib = getVoiceLib();
  if (!lib) {
    throw new Error("@discordjs/voice がインストールされていません。");
  }

  cleanupSession(guildId);

  const connection = lib.joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: guildVoiceAdapterCreator,
    selfDeaf: false,
  });

  const player = lib.createAudioPlayer();
  connection.subscribe(player);

  setupConnection(guildId, connection, lib.VoiceConnectionStatus, lib.entersState);
  setupPlayer(guildId, player, lib.AudioPlayerStatus);

  sessions.set(guildId, {
    guildId,
    textChannelId,
    voiceChannelId: voiceChannel.id,
    connection,
    player,
    queue: [],
    reading: false,
  });
}

function stopSession(guildId) {
  const exists = sessions.has(guildId);
  cleanupSession(guildId);
  return exists;
}

function getSession(guildId) {
  return sessions.get(guildId) ?? null;
}

function buildSpeakText(message) {
  const base = message.content?.trim() || "";
  const attachmentCount = message.attachments?.size ?? 0;

  let text = base;
  if (attachmentCount > 0) {
    text += text ? `。添付ファイル${attachmentCount}件` : `添付ファイル${attachmentCount}件`;
  }

  if (!text) return null;

  return `${message.member?.displayName ?? message.author.username}。${text}`
    .replace(/https?:\/\/\S+/g, "URL省略")
    .replace(/[\r\n]+/g, "。")
    .slice(0, 180);
}

function buildTtsUrl(text) {
  const url = new URL("https://translate.google.com/translate_tts");
  url.searchParams.set("ie", "UTF-8");
  url.searchParams.set("tl", "ja");
  url.searchParams.set("client", "tw-ob");
  url.searchParams.set("q", text);
  return url.toString();
}

async function enqueueMessage(message) {
  const session = getSession(message.guildId);
  if (!session) return false;
  if (session.textChannelId !== message.channelId) return false;

  const speakText = buildSpeakText(message);
  if (!speakText) return false;

  session.queue.push(speakText);
  if (!session.reading) {
    await playNext(session.guildId);
  }

  return true;
}

async function playNext(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;

  const lib = getVoiceLib();
  if (!lib) {
    cleanupSession(guildId);
    return;
  }

  const nextText = session.queue.shift();
  if (!nextText) {
    session.reading = false;
    return;
  }

  session.reading = true;

  try {
    const response = await fetch(buildTtsUrl(nextText), {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok || !response.body) {
      throw new Error(`TTS request failed: ${response.status}`);
    }

    const resource = lib.createAudioResource(response.body, {
      inputType: lib.StreamType.Arbitrary,
      inlineVolume: false,
    });

    session.player.play(resource);
  } catch (error) {
    console.error("[VC_READ] TTS playback error:", error);
    session.reading = false;
    await playNext(guildId);
  }
}

module.exports = {
  enqueueMessage,
  getSession,
  getVoiceLib,
  startSession,
  stopSession,
};
