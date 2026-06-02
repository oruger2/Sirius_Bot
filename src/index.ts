import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	Client,
	Collection,
	GatewayIntentBits,
	Partials,
	REST,
	Routes,
	ShardingManager,
} from "discord.js";
import * as dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { initErrorReporting } from "@/utils/errorWebhook";
import { ensureJsonDataDir } from "@/utils/jsonFileStore";

dotenv.config();
initErrorReporting();

const token = process.env.DISCORD_BOT_TOKEN ?? "";

if (!token) {
	throw new Error("❌ DISCORD_BOT_TOKEN が設定されていません");
}

const applicationId = process.env.DISCORD_CLIENT_ID ?? "";

if (!applicationId) {
	throw new Error("❌ DISCORD_CLIENT_ID が設定されていません");
}

const SHARD_LIST = [0, 1] as const;
const TOTAL_SHARDS = SHARD_LIST.length;
const API_PORT = Number.parseInt(process.env.API_PORT ?? "20419", 10);

/* ======================
   コマンド型
====================== */

type CommandModule = {
	data: { name: string; toJSON: () => unknown };
	execute: (...args: unknown[]) => Promise<unknown> | unknown;
};

type EventModule = {
	name: string;
	once?: boolean;
	execute: (...args: unknown[]) => Promise<unknown> | unknown;
};

/* ======================
   Client拡張
====================== */

class ExtendedClient extends Client {
	commands: Collection<string, CommandModule> = new Collection();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isTargetModule = (file: string) =>
	!file.includes(".ipynb_checkpoints") &&
	(file.endsWith(".ts") || file.endsWith(".js"));

const listDirectoryIfExists = async (targetPath: string) => {
	try {
		return await fsPromises.readdir(targetPath);
	} catch (error: unknown) {
		const isMissingDirectory =
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			(error as { code?: string }).code === "ENOENT";

		if (isMissingDirectory) {
			console.warn(`⚠️ ディレクトリが見つかりません: ${targetPath}`);
			return [];
		}

		throw error;
	}
};

const parseCurrentShardId = () => {
	const rawShardEnv = process.env.SHARDS;

	if (!rawShardEnv) {
		return 0;
	}

	try {
		const parsed = JSON.parse(rawShardEnv);

		if (typeof parsed === "number" && Number.isInteger(parsed)) {
			return parsed;
		}

		if (
			Array.isArray(parsed) &&
			typeof parsed[0] === "number" &&
			Number.isInteger(parsed[0])
		) {
			return parsed[0];
		}
	} catch {
		// Fall through to number parsing
	}

	const parsedInt = Number.parseInt(rawShardEnv, 10);
	return Number.isNaN(parsedInt) ? 0 : parsedInt;
};

const createClient = () =>
	new ExtendedClient({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.GuildMessageReactions,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildVoiceStates,
		],
		partials: [Partials.Message, Partials.Channel, Partials.Reaction],
	});

const setupApiRoutes = (client: ExtendedClient, rest: REST) => {
	const app = express();

	app.get("/api/guilds", async (req: Request, res: Response) => {
		void req;

		try {
			if (!client.shard) {
				return res.json(client.guilds.cache.map((guild) => guild.id));
			}

			const guildIdsByShard = await client.shard.broadcastEval((c) =>
				c.guilds.cache.map((guild) => guild.id),
			);

			return res.json(guildIdsByShard.flat());
		} catch (err: unknown) {
			const errorMessage =
				err instanceof Error ? err.message : "Unknown error occurred";
			return res.status(500).json({ error: errorMessage });
		}
	});

	app.get("/api/shards", async (req: Request, res: Response) => {
		void req;

		try {
			if (!client.shard) {
				return res.json([
					{
						id: 0,
						status: client.ws.status,
						ping: client.ws.ping,
						guildCount: client.guilds.cache.size,
						guildIds: client.guilds.cache.map((g) => g.id),
					},
				]);
			}

			const shardData = await client.shard.broadcastEval((c) => {
				return {
					id: c.shard?.ids[0] ?? 0,
					status: c.ws.status,
					ping: c.ws.ping,
					guildCount: c.guilds.cache.size,
					guildIds: c.guilds.cache.map((g) => g.id),
				};
			});

			const sorted = shardData.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
			return res.json(sorted);
		} catch (err: unknown) {
			const errorMessage =
				err instanceof Error ? err.message : "Unknown error occurred";
			return res.status(500).json({ error: errorMessage });
		}
	});

	app.get(
		"/api/shards/:id",
		async (req: Request<{ id: string }>, res: Response) => {
			const targetId = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(targetId)) {
				return res.status(400).json({ error: "Invalid shard id" });
			}

			try {
				if (!client.shard) {
					if (targetId !== 0) {
						return res.status(404).json({ error: "Shard not found" });
					}

					return res.json({
						id: 0,
						ping: client.ws.ping,
						guilds: client.guilds.cache.map((g) => g.id),
					});
				}

				const results = await client.shard.broadcastEval(
					(c, { shardTargetId }) => {
						if (c.shard?.ids.includes(shardTargetId)) {
							return {
								id: shardTargetId,
								ping: c.ws.ping,
								guilds: c.guilds.cache.map((g) => g.id),
							};
						}

						return null;
					},
					{ context: { shardTargetId: targetId } },
				);

				const data = results.find((result) => result !== null);

				if (!data) {
					return res.status(404).json({ error: "Shard not found" });
				}

				return res.json(data);
			} catch (err: unknown) {
				const errorMessage =
					err instanceof Error ? err.message : "Unknown error occurred";
				return res.status(500).json({ error: errorMessage });
			}
		},
	);

	app.get("/api/commands", async (req: Request, res: Response) => {
		void req;

		try {
			const commands = await rest.get(
				Routes.applicationCommands(applicationId),
			);
			return res.status(200).json(commands);
		} catch (error) {
			console.error("Fetch error:", error);
			return res
				.status(500)
				.json({ error: "Failed to fetch commands from Discord" });
		}
	});

	app.listen(API_PORT, () => {
		console.log(`✅ API started on shard 0 (port: ${API_PORT})`);
	});
};

async function loadCommands(client: ExtendedClient) {
	const commandPath = path.join(__dirname, "commands");
	const commandFiles = (await listDirectoryIfExists(commandPath)).filter(
		isTargetModule,
	);

	for (const file of commandFiles) {
		const filePath = path.join(commandPath, file);
		const commandModule = await import(pathToFileURL(filePath).href);
		const command = (commandModule?.default ?? commandModule) as CommandModule;

		if (!command?.data?.name || !command?.execute) {
			console.warn(`⚠️ ${file} は data または execute が不足`);
			continue;
		}

		if (client.commands.has(command.data.name)) {
			console.warn(`⚠️ コマンド重複: ${command.data.name}`);
			continue;
		}

		client.commands.set(command.data.name, command);
	}

	console.log(`✅ コマンド読み込み: ${client.commands.size}`);
}

async function loadEvents(client: ExtendedClient) {
	const eventPath = path.join(__dirname, "events");

	const eventFiles = (await listDirectoryIfExists(eventPath))
		.filter(isTargetModule)
		.filter((file: string) => !file.startsWith("blacklist."));

	const preflightMaxListeners = Math.max(10, eventFiles.length);
	client.setMaxListeners(preflightMaxListeners);

	const loadedEvents: EventModule[] = [];
	const eventNameCounts = new Map<string, number>();

	for (const file of eventFiles) {
		if (file.startsWith("blacklist.")) {
			continue;
		}

		const filePath = path.join(eventPath, file);
		const eventModule = await import(pathToFileURL(filePath).href);
		const event = (eventModule?.default ?? eventModule) as EventModule;

		if (!event?.name || !event?.execute) {
			console.warn(`⚠️ ${file} は event構造が不正`);
			continue;
		}

		loadedEvents.push(event);
		eventNameCounts.set(event.name, (eventNameCounts.get(event.name) ?? 0) + 1);
	}

	const maxListenerCount = Math.max(10, ...eventNameCounts.values());
	const finalMaxListeners = Math.max(preflightMaxListeners, maxListenerCount);

	if (finalMaxListeners > 10) {
		client.setMaxListeners(finalMaxListeners);
	}

	for (const event of loadedEvents) {
		const handler = async (...args: unknown[]) => {
			try {
				await event.execute(...args, client);
			} catch (error) {
				console.error(`❌ Event Error: ${event.name}`, error);
			}
		};

		if (event.once) {
			client.once(event.name, handler);
		} else {
			client.on(event.name, handler);
		}
	}

	console.log(`✅ イベント読み込み: ${loadedEvents.length}`);
}

async function runShardProcess() {
	const client = createClient();
	const rest = new REST({ version: "10" }).setToken(token);
	const shardId = parseCurrentShardId();
	const primaryShard = shardId === 0;

	await ensureJsonDataDir();
	await loadCommands(client);
	await loadEvents(client);

	if (primaryShard) {
		setupApiRoutes(client, rest);
	}

	client.on("error", (error) => {
		console.error("❌ Client error", error);
	});

	await client.login(token);

	if (primaryShard) {
		const slashCommands = client.commands.map((command) =>
			command.data.toJSON(),
		);

		await rest.put(Routes.applicationCommands(applicationId), {
			body: slashCommands,
		});

		console.log(
			`✅ [Shard ${shardId}] コマンド登録完了: ${slashCommands.length}`,
		);
	} else {
		console.log(`ℹ️ [Shard ${shardId}] コマンド登録をスキップ`);
	}
}

async function runManagerProcess() {
	const manager = new ShardingManager(__filename, {
		token,
		totalShards: TOTAL_SHARDS,
		shardList: [...SHARD_LIST],
		respawn: true,
		execArgv: process.execArgv,
	});

	manager.on("shardCreate", (shard) => {
		console.log(`🚀 Shard ${shard.id} を起動中...`);
		shard.on("death", () => {
			console.error(`❌ Shard ${shard.id} が停止しました`);
		});
		shard.on("disconnect", () => {
			console.warn(`⚠️ Shard ${shard.id} が切断されました`);
		});
		shard.on("reconnecting", () => {
			console.warn(`🔁 Shard ${shard.id} が再接続中です`);
		});
	});

	await manager.spawn({ amount: TOTAL_SHARDS, delay: 5500, timeout: -1 });
	console.log(`✅ ShardingManager 起動完了 (shards: ${SHARD_LIST.join(", ")})`);
}

const shardProcess = Boolean(process.env.SHARDING_MANAGER);

if (shardProcess) {
	runShardProcess().catch((err: unknown) => {
		console.error("❌ Bot初期化失敗", err);
		process.exitCode = 1;
	});
} else {
	runManagerProcess().catch((err: unknown) => {
		console.error("❌ ShardingManager 初期化失敗", err);
		process.exitCode = 1;
	});
}
