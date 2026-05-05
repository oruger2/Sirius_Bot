import type { VoiceState } from "discord.js";
import { Events } from "discord.js";
import { clearGuildTtsSession, getGuildTtsSession } from "@/tts/session";
import {
	disconnectGuildSpeech,
	getConnectedTtsChannelId,
	hasConnectedTtsSession,
} from "@/tts/voice";

export default {
	name: Events.VoiceStateUpdate,
	async execute(oldState: VoiceState, newState: VoiceState) {
		const guild = newState.guild ?? oldState.guild;
		if (!guild) {
			return;
		}

		const session = getGuildTtsSession(guild.id);
		if (!session) {
			disconnectGuildSpeech(guild.id);
			return;
		}

		if (!hasConnectedTtsSession(guild.id)) {
			return;
		}

		const connectedChannelId = getConnectedTtsChannelId(guild.id);
		if (!connectedChannelId) {
			return;
		}

		const connectedChannel = guild.channels.cache.get(connectedChannelId);
		if (!connectedChannel?.isVoiceBased()) {
			disconnectGuildSpeech(guild.id);
			return;
		}

		const humanCount = connectedChannel.members.filter(
			(member) => !member.user.bot,
		).size;

		if (humanCount > 0) {
			return;
		}

		clearGuildTtsSession(guild.id);
		disconnectGuildSpeech(guild.id);
	},
};
