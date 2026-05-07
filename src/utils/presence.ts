import { ActivityType, type Client, type PresenceStatusData } from "discord.js";
import { readJsonData } from "@/utils/jsonFileStore";

const PARTIAL_OUTAGE_ACTIVITY = "一部コマンドが利用できません";

type BotCounts = {
	guildCount: number;
	totalUsers: number;
};

type PresencePayload = {
	activities: Array<{
		name: string;
		type: ActivityType;
	}>;
	status: PresenceStatusData;
};

export const readStoppingCommands = async () => {
	const config = await readJsonData("config.json", {
		stopping: [] as string[],
	});

	return Array.isArray(config.stopping) ? config.stopping : [];
};

const buildPresencePayload = (
	counts: BotCounts,
	ping: number,
	shardCount: number,
	stoppedCommands: string[],
): PresencePayload => {
	if (stoppedCommands.length > 0) {
		return {
			activities: [
				{
					name: PARTIAL_OUTAGE_ACTIVITY,
					type: ActivityType.Playing,
				},
			],
			status: "idle",
		};
	}

	return {
		activities: [
			{
				name: `Servers:${counts.guildCount} | Users:${counts.totalUsers} | Ping:${ping}ms | Shards:${shardCount}`,
				type: ActivityType.Playing,
			},
		],
		status: "online",
	};
};

const collectCounts = async (client: Client): Promise<BotCounts> => {
	if (!client.shard) {
		return {
			guildCount: client.guilds.cache.size,
			totalUsers: client.guilds.cache.reduce(
				(sum, guild) => sum + (guild.memberCount ?? 0),
				0,
			),
		};
	}

	const results = await client.shard.broadcastEval((c) => ({
		guilds: c.guilds.cache.size,
		users: c.guilds.cache.reduce(
			(sum, guild) => sum + (guild.memberCount ?? 0),
			0,
		),
	}));

	return {
		guildCount: results.reduce((sum, result) => sum + result.guilds, 0),
		totalUsers: results.reduce((sum, result) => sum + result.users, 0),
	};
};

export const updateGlobalPresence = async (
	client: Client,
	stoppedCommands?: string[],
) => {
	if (!client.user) {
		return;
	}

	const counts = await collectCounts(client);
	const ping = Math.round(client.ws.ping);
	const shardCount = client.shard?.count ?? 1;
	const resolvedStoppedCommands =
		stoppedCommands ?? (await readStoppingCommands());
	const presence = buildPresencePayload(
		counts,
		ping,
		shardCount,
		resolvedStoppedCommands,
	);

	if (!client.shard) {
		await client.user.setPresence(presence);
		return;
	}

	await client.shard.broadcastEval(
		(shardClient, context) => shardClient.user?.setPresence(context.presence),
		{ context: { presence } },
	);
};
