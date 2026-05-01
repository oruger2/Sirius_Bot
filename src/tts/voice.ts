import { Readable } from "node:stream";
import {
	AudioPlayerStatus,
	createAudioPlayer,
	createAudioResource,
	entersState,
	getVoiceConnection,
	joinVoiceChannel,
	NoSubscriberBehavior,
	StreamType,
	type VoiceConnection,
	VoiceConnectionStatus,
} from "@discordjs/voice";
import type { Guild, GuildBasedChannel, VoiceBasedChannel } from "discord.js";
import googleTTS from "google-tts-api";

type GuildSpeechState = {
	queue: string[];
	processing: boolean;
	player: ReturnType<typeof createAudioPlayer>;
};

const statesByGuild = new Map<string, GuildSpeechState>();
const MAX_TTS_TEXT_LENGTH = 180;

const getOrCreateState = (guildId: string): GuildSpeechState => {
	const existing = statesByGuild.get(guildId);
	if (existing) {
		return existing;
	}

	const created: GuildSpeechState = {
		queue: [],
		processing: false,
		player: createAudioPlayer({
			behaviors: {
				noSubscriber: NoSubscriberBehavior.Pause,
			},
		}),
	};

	statesByGuild.set(guildId, created);
	return created;
};

const isVoiceLikeChannel = (
	channel: GuildBasedChannel | null | undefined,
): channel is VoiceBasedChannel => Boolean(channel?.isVoiceBased());

const normalizeText = (input: string) => {
	const withoutUrls = input.replaceAll(/https?:\/\/\S+/g, "URL");
	const compact = withoutUrls.replaceAll(/\s+/g, " ").trim();
	if (!compact) {
		return "メッセージ";
	}
	if (compact.length <= MAX_TTS_TEXT_LENGTH) {
		return compact;
	}
	return `${compact.slice(0, MAX_TTS_TEXT_LENGTH)}。以下省略`;
};

const destroyConnectionSafely = (
	connection: VoiceConnection | undefined,
	context: string,
) => {
	if (!connection) {
		return;
	}

	if (connection.state.status === VoiceConnectionStatus.Destroyed) {
		console.log(`[TTS] Connection already destroyed (${context})`);
		return;
	}

	try {
		connection.destroy();
	} catch (error) {
		console.error(`[TTS] Failed to destroy connection (${context}):`, error);
	}
};

const ensureConnection = async (guild: Guild, voiceChannelId: string) => {
	console.log(
		`[TTS] Ensuring connection for guild ${guild.id} to channel ${voiceChannelId}`,
	);
	const targetChannel = guild.channels.cache.get(voiceChannelId);
	if (!isVoiceLikeChannel(targetChannel)) {
		console.log(`[TTS] Target channel is not voice-based`);
		return null;
	}

	let connection = getVoiceConnection(guild.id);
	if (connection && connection.joinConfig.channelId !== targetChannel.id) {
		console.log(`[TTS] Destroying existing connection`);
		destroyConnectionSafely(connection, "switch-channel");
		connection = undefined;
	}

	if (!connection) {
		console.log(`[TTS] Joining voice channel`);
		connection = joinVoiceChannel({
			guildId: guild.id,
			channelId: targetChannel.id,
			selfDeaf: true,
			adapterCreator: guild.voiceAdapterCreator,
		});
	}

	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
		console.log(`[TTS] Connection ready`);
		return connection;
	} catch (error) {
		console.error(`[TTS] Failed to enter ready state:`, error);
		destroyConnectionSafely(connection, "ready-timeout");
		return null;
	}
};

export const connectGuildSpeech = async (
	guild: Guild,
	voiceChannelId: string,
) => {
	const connection = await ensureConnection(guild, voiceChannelId);
	return connection !== null;
};

const createSpeechResource = async (text: string) => {
	console.log(`[TTS] Generating audio for text: ${text}`);
	const url = googleTTS.getAudioUrl(text, {
		lang: "ja",
		slow: false,
		host: "https://translate.google.com",
	});
	console.log(`[TTS] TTS URL: ${url}`);
	const response = await fetch(url);
	console.log(`[TTS] Fetch response status: ${response.status}`);
	if (!response.ok) {
		throw new Error(`TTS audio fetch failed: ${response.status}`);
	}
	const audioBuffer = Buffer.from(await response.arrayBuffer());
	console.log(`[TTS] Audio buffer size: ${audioBuffer.length}`);
	const audioStream = Readable.from(audioBuffer);

	return createAudioResource(audioStream, {
		inputType: StreamType.Arbitrary,
	});
};

const processQueue = async (
	guild: Guild,
	voiceChannelId: string,
	state: GuildSpeechState,
) => {
	if (state.processing) {
		return;
	}

	state.processing = true;
	console.log(`[TTS] Starting queue processing for guild ${guild.id}`);

	try {
		while (state.queue.length > 0) {
			const nextText = state.queue.shift();
			if (!nextText) {
				continue;
			}
			console.log(`[TTS] Processing text: ${nextText}`);

			const connection = await ensureConnection(guild, voiceChannelId);
			if (!connection) {
				console.log(
					`[TTS] Failed to establish connection for guild ${guild.id}`,
				);
				state.queue.length = 0;
				break;
			}
			console.log(`[TTS] Connection established`);

			connection.subscribe(state.player);
			console.log(`[TTS] Player subscribed`);

			try {
				const resource = await createSpeechResource(nextText);
				console.log(`[TTS] Audio resource created`);
				state.player.play(resource);
				console.log(`[TTS] Started playing`);

				await entersState(state.player, AudioPlayerStatus.Playing, 7_000);
				console.log(`[TTS] Player is playing`);
				await entersState(state.player, AudioPlayerStatus.Idle, 90_000);
				console.log(`[TTS] Player idle`);
			} catch (error) {
				console.error(`[TTS] Error during speech creation or playback:`, error);
				state.player.stop(true);
			}
		}
	} finally {
		state.processing = false;
		console.log(`[TTS] Queue processing finished for guild ${guild.id}`);
	}
};

export const enqueueGuildSpeech = async (
	guild: Guild,
	voiceChannelId: string,
	text: string,
) => {
	const normalized = normalizeText(text);
	console.log(`[TTS] Enqueuing speech for guild ${guild.id}: ${normalized}`);
	const state = getOrCreateState(guild.id);
	state.queue.push(normalized);
	await processQueue(guild, voiceChannelId, state);
};

export const disconnectGuildSpeech = (guildId: string) => {
	const connection = getVoiceConnection(guildId);
	destroyConnectionSafely(connection, "manual-disconnect");

	const state = statesByGuild.get(guildId);
	if (!state) {
		return;
	}

	state.queue.length = 0;
	state.player.stop(true);
	statesByGuild.delete(guildId);
};

export const hasConnectedTtsSession = (guildId: string) =>
	Boolean(getVoiceConnection(guildId));

export const getConnectedTtsChannelId = (guildId: string) =>
	getVoiceConnection(guildId)?.joinConfig.channelId ?? null;
