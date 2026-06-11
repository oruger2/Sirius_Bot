import { Events, type Guild } from "discord.js";
import prisma from "@/database/db";

export default {
	name: Events.GuildCreate,

	async execute(guild: Guild) {
		try {
			await prisma.serverSetting.upsert({
				where: {
					serverId: guild.id,
				},
				update: {},
				create: {
					serverId: guild.id,
				},
			});

		} catch (error) {
			console.error(
				`❌ Failed to create ServerSetting for ${guild.id}`,
				error,
			);
		}
	},
};