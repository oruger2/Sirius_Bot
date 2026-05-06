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
		return;
	}

	try {
		connection.destroy();
	} catch (error) {
		console.error(`[TTS] Failed to destroy connection (${context}):`, error);
	}
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const joinChannelWithReady = async (
	targetChannel: VoiceBasedChannel,
): Promise<VoiceConnection | null> => {
	const connection = joinVoiceChannel({
		guildId: targetChannel.guild.id,
		channelId: targetChannel.id,
		selfDeaf: true,
		adapterCreator: targetChannel.guild.voiceAdapterCreator,
	});

	const logConnectionError = (error: Error) =>
		console.error(
			`[TTS] Voice connection error for guild ${targetChannel.guild.id}:`,
			error,
		);
	connection.on("error", logConnectionError);

	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
		return connection;
	} catch (error) {
		console.error(`[TTS] Failed to enter ready state:`, error);
		console.error(
			`[TTS] Connection status after timeout: ${connection.state.status}`,
		);
		destroyConnectionSafely(connection, "ready-timeout");
		return null;
	} finally {
		connection.off("error", logConnectionError);
	}
};

const ensureConnection = async (guild: Guild, voiceChannelId: string) => {
	const targetChannel = guild.channels.cache.get(voiceChannelId);
	if (!isVoiceLikeChannel(targetChannel)) {
		return null;
	}

	let connection = getVoiceConnection(guild.id);
	if (connection && connection.joinConfig.channelId !== targetChannel.id) {
		destroyConnectionSafely(connection, "switch-channel");
		connection = undefined;
	}

	if (connection) {
		if (connection.state.status === VoiceConnectionStatus.Destroyed) {
			connection = undefined;
		} else if (connection.state.status === VoiceConnectionStatus.Ready) {
			return connection;
		} else {
			try {
				await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
				return connection;
			} catch {
				destroyConnectionSafely(connection, "stale-connection");
				connection = undefined;
			}
		}
	}

	for (let attempt = 1; attempt <= 2; attempt += 1) {
		connection = (await joinChannelWithReady(targetChannel)) ?? undefined;
		if (connection) {
			return connection;
		}
		if (attempt < 2) {
			await sleep(500);
		}
	}

	return null;
};

export const connectGuildSpeech = async (
	guild: Guild,
	voiceChannelId: string,
) => {
	const connection = await ensureConnection(guild, voiceChannelId);
	return connection !== null;
};

const createSpeechResource = async (text: string) => {
	const url = googleTTS.getAudioUrl(text, {
		lang: "ja",
		slow: false,
		host: "https://translate.google.com",
	});
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`TTS audio fetch failed: ${response.status}`);
	}
	const audioBuffer = Buffer.from(await response.arrayBuffer());
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

	try {
		while (state.queue.length > 0) {
			const nextText = state.queue.shift();
			if (!nextText) {
				continue;
			}

			const connection = await ensureConnection(guild, voiceChannelId);
			if (!connection) {
				state.queue.length = 0;
				break;
			}

			connection.subscribe(state.player);

			try {
				const resource = await createSpeechResource(nextText);
				state.player.play(resource);

				await entersState(state.player, AudioPlayerStatus.Playing, 7_000);
				await entersState(state.player, AudioPlayerStatus.Idle, 90_000);
			} catch (error) {
				console.error(`[TTS] Error during speech creation or playback:`, error);
				state.player.stop(true);
			}
		}
	} finally {
		state.processing = false;
	}
};

export const enqueueGuildSpeech = async (
	guild: Guild,
	voiceChannelId: string,
	text: string,
) => {
	const normalized = normalizeText(text);
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
