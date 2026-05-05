import type { Message } from "discord.js";
import { Events } from "discord.js";
import { getGuildTtsSession } from "@/tts/session";
import {
	enqueueGuildSpeech,
	getConnectedTtsChannelId,
	hasConnectedTtsSession,
} from "@/tts/voice";

const buildSpeechText = (message: Message) => {
	const sender = message.member?.displayName ?? message.author.displayName;
	const body = message.content.trim();
	const attachmentNote =
		message.attachments.size > 0 ? " 添付ファイルあり。" : "";

	if (body.length === 0) {
		return `${sender}さん。${attachmentNote.trim() || "メッセージ"}`;
	}

	return `${sender}さん。${body}${attachmentNote}`;
};

export default {
	name: Events.MessageCreate,
	async execute(message: Message) {
		if (message.author.bot || !message.inGuild()) {
			return;
		}

		const config = getGuildTtsSession(message.guildId);
		if (!config) {
			return;
		}

		if (message.channelId !== config.textChannelId) {
			return;
		}

		if (!hasConnectedTtsSession(message.guildId)) {
			return;
		}

		if (getConnectedTtsChannelId(message.guildId) !== config.voiceChannelId) {
			return;
		}

		const voiceChannel = message.guild.channels.cache.get(
			config.voiceChannelId,
		);
		if (!voiceChannel?.isVoiceBased()) {
			return;
		}

		const humanCount = voiceChannel.members.filter(
			(member) => !member.user.bot,
		).size;
		if (humanCount === 0) {
			return;
		}

		const text = buildSpeechText(message);
		await enqueueGuildSpeech(message.guild, config.voiceChannelId, text);
	},
};
