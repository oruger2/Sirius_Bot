import { Events } from "discord.js";
import type { Message } from "discord.js";
import { sessionsByGuild } from "@/commands/wolfgame/registry";

export default {
	name: Events.MessageCreate,
	async execute(message: Message) {
		if (message.author.bot || !message.inGuild()) return;

		const session = sessionsByGuild.get(message.guildId);
		if (!session || session.closed || !session.mainChannelId) return;

		const inMainChannel = message.channelId === session.mainChannelId;
		const inMainThread =
			message.channel.isThread() &&
			message.channel.parentId === session.mainChannelId;
		if (!inMainChannel && !inMainThread) return;

		const player = session.players.get(message.author.id);
		const isDeadPlayer = Boolean(player && !player.alive);
		const isNight = session.phase === "night";

		if (!isDeadPlayer && !isNight) return;

		await message.delete().catch(() => {});  // Ignore errors
	},
};
