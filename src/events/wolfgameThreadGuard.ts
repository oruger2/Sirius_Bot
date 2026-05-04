import { Events } from "discord.js";
import type { AnyThreadChannel } from "discord.js";
import { sessionsByGuild } from "@/commands/wolfgame/registry";

export default {
	name: Events.ThreadCreate,
	async execute(thread: AnyThreadChannel) {
		const guildId = thread.guildId;
		if (!guildId) return;

		const session = sessionsByGuild.get(guildId);
		if (!session || session.closed || !session.mainChannelId) return;
		if (thread.parentId !== session.mainChannelId) return;

		let ownerId: string | undefined = thread.ownerId;
		if (!ownerId) {
			try {
				const owner = await thread.fetchOwner();
				ownerId = owner?.id;
			} catch {
				ownerId = undefined;
			}
		}
		if (!ownerId) return;

		const player = session.players.get(ownerId);
		if (!player || player.alive) return;

		await thread.delete("wolfgame: dead player cannot create threads").catch(() => {});  // Ignore errors
	},
};
