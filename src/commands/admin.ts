import * as vm from "node:vm";
import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";
import { readJsonData, writeJsonData } from "@/utils/jsonFileStore";
import { updateGlobalPresence } from "@/utils/presence";
import { sendStoppedCommandsStatus } from "@/utils/statusWebhook";

type GuildListEntry = {
	id: string;
	name: string;
	shardId: number;
};

type LeaveResult =
	| {
		id: string;
		name: string;
		shardId: number;
		success: true;
	  }
	| {
		id: string;
		name: string;
		shardId: number;
		success: false;
		error: string;
	  };

	type InviteResult =
	| {
		id: string;
		name: string;
		shardId: number;
		success: true;
		url: string;
	  }
	| {
		id: string;
		name: string;
		shardId: number;
		success: false;
		error: string;
	  };

const getAllGuilds = async (
	interaction: ChatInputCommandInteraction,
): Promise<GuildListEntry[]> => {
	if (!interaction.client.shard) {
		return interaction.client.guilds.cache.map((guild) => ({
			id: guild.id,
			name: guild.name,
			shardId: guild.shardId,
		}));
	}

	const results = await interaction.client.shard.broadcastEval((client) => {
		const shardId = client.shard?.ids[0] ?? 0;
		return client.guilds.cache.map((guild) => ({
			id: guild.id,
			name: guild.name,
			shardId,
		}));
	});

	return results.flat();
};

const leaveGuildAcrossShards = async (
	interaction: ChatInputCommandInteraction,
	guildId: string,
): Promise<LeaveResult | null> => {
	if (!interaction.client.shard) {
		const guild = interaction.client.guilds.cache.get(guildId);
		if (!guild) return null;

		try {
			await guild.leave();
			return {
				id: guild.id,
				name: guild.name,
				shardId: guild.shardId,
				success: true,
			};
		} catch (error: unknown) {
			return {
				id: guild.id,
				name: guild.name,
				shardId: guild.shardId,
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	const results = await interaction.client.shard.broadcastEval(
		async (client, { targetGuildId }) => {
			const guild = client.guilds.cache.get(targetGuildId);
			if (!guild) return null;

			const shardId = client.shard?.ids[0] ?? 0;

			try {
				await guild.leave();
				return {
					id: guild.id,
					name: guild.name,
					shardId,
					success: true as const,
				};
			} catch (error: unknown) {
				return {
					id: guild.id,
					name: guild.name,
					shardId,
					success: false as const,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
		{ context: { targetGuildId: guildId } },
	);

	return (
		results.find((result): result is LeaveResult => result !== null) ?? null
	);
};

const createGuildInviteAcrossShards = async (
	interaction: ChatInputCommandInteraction,
	guildId: string,
): Promise<InviteResult | null> => {
	if (!interaction.client.shard) {
		const guild = interaction.client.guilds.cache.get(guildId);
		if (!guild) return null;

		const botMember = guild.members.me;
		if (!botMember) {
			return {
				id: guild.id,
				name: guild.name,
				shardId: guild.shardId,
				success: false,
				error: "Botメンバー情報を取得できません",
			};
		}

		const channel = guild.channels.cache.find(
			(c) =>
				c.isTextBased() &&
				c.permissionsFor(botMember)?.has("CreateInstantInvite"),
		);

		if (!channel || !("createInvite" in channel)) {
			return {
				id: guild.id,
				name: guild.name,
				shardId: guild.shardId,
				success: false,
				error: "招待リンクを作成できるチャンネルがありません",
			};
		}

		try {
			const invite = await channel.createInvite({ maxAge: 0 });
			return {
				id: guild.id,
				name: guild.name,
				shardId: guild.shardId,
				success: true,
				url: invite.url,
			};
		} catch (error: unknown) {
			return {
				id: guild.id,
				name: guild.name,
				shardId: guild.shardId,
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	const results = await interaction.client.shard.broadcastEval(
		async (client, { targetGuildId }) => {
			const guild = client.guilds.cache.get(targetGuildId);
			if (!guild) return null;

			const shardId = client.shard?.ids[0] ?? 0;
			const botMember = guild.members.me;

			if (!botMember) {
				return {
					id: guild.id,
					name: guild.name,
					shardId,
					success: false as const,
					error: "Botメンバー情報を取得できません",
				};
			}

			const channel = guild.channels.cache.find(
				(c) =>
					c.isTextBased() &&
					c.permissionsFor(botMember)?.has("CreateInstantInvite"),
			);

			if (!channel || !("createInvite" in channel)) {
				return {
					id: guild.id,
					name: guild.name,
					shardId,
					success: false as const,
					error: "招待リンクを作成できるチャンネルがありません",
				};
			}

			try {
				const invite = await channel.createInvite({ maxAge: 0 });
				return {
					id: guild.id,
					name: guild.name,
					shardId,
					success: true as const,
					url: invite.url,
				};
			} catch (error: unknown) {
				return {
					id: guild.id,
					name: guild.name,
					shardId,
					success: false as const,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
		{ context: { targetGuildId: guildId } },
	);

	return (
		results.find((result): result is InviteResult => result !== null) ?? null
	);
};

const command = {
	data: new SlashCommandBuilder()
		.setName("admin")
		.setDescription("管理者専用のコマンドです")

		.addSubcommand((sub) =>
			sub
				.setName("server")
				.setDescription("ボットが参加中のサーバーを表示します"),
		)

		.addSubcommand((sub) =>
			sub
				.setName("leave")
				.setDescription("指定されたサーバーからボットを退出させます")
				.addStringOption((opt) =>
					opt
						.setName("server_id")
						.setDescription("サーバーID")
						.setRequired(true),
				),
		)

		.addSubcommand((sub) =>
			sub
				.setName("invite")
				.setDescription("指定されたサーバーの招待リンクを生成します")
				.addStringOption((opt) =>
					opt
						.setName("server_id")
						.setDescription("サーバーID")
						.setRequired(true),
				),
		)

		.addSubcommand((sub) =>
			sub
				.setName("member")
				.setDescription("Bot管理者を追加します")
				.addUserOption((opt) =>
					opt
						.setName("user")
						.setDescription("管理者として追加するユーザー")
						.setRequired(true),
				),
		)

		.addSubcommand((sub) =>
			sub
				.setName("stop")
				.setDescription("指定コマンドを停止/再開します")
				.addStringOption((opt) =>
					opt
						.setName("command")
						.setDescription("対象コマンド名（例: money または /money）")
						.setRequired(true),
				),
		)

		.addSubcommand((sub) =>
			sub
				.setName("blacklist")
				.setDescription("ユーザーまたはサーバーをブラックリストに登録します")
				.addStringOption((opt) =>
					opt
						.setName("type")
						.setDescription("登録タイプ")
						.setRequired(true)
						.addChoices(
							{ name: "ユーザー", value: "user" },
							{ name: "サーバー", value: "server" },
						),
				)
				.addStringOption((opt) =>
					opt
						.setName("id")
						.setDescription("ユーザーID または サーバーID")
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("code")
				.setDescription("JavaScriptコードを実行")
				.addStringOption((opt) =>
					opt
						.setName("script")
						.setDescription("実行するコード")
						.setRequired(true),
				),
		),

	async execute(interaction: ChatInputCommandInteraction) {
		const sendEphemeral = async (embed: EmbedBuilder) => {
			const replyPayload = { embeds: [embed], flags: ["Ephemeral"] as const };
			const editPayload = { embeds: [embed] };
			const followUpPayload = {
				embeds: [embed],
				flags: ["Ephemeral"] as const,
			};
			const tryEdit = async () => {
				try {
					return await interaction.editReply(editPayload);
				} catch (error) {
					if (
						error instanceof Error &&
						error.name === "InteractionNotReplied"
					) {
						return null;
					}
					throw error;
				}
			};
			const tryReply = async () => {
				try {
					return await interaction.reply(replyPayload);
				} catch (error) {
					if ((error as { code?: number }).code === 40060) {
						return null;
					}
					throw error;
				}
			};
			const tryFollowUp = async () => {
				try {
					return await interaction.followUp(followUpPayload);
				} catch {
					return null;
				}
			};
			if (interaction.deferred || interaction.replied) {
				const edited = await tryEdit();
				if (edited) {
					return edited;
				}
				const replied = await tryReply();
				if (replied) {
					return replied;
				}
				await tryFollowUp();
				return;
			}
			const replied = await tryReply();
			if (replied) {
				return replied;
			}
			const edited = await tryEdit();
			if (edited) {
				return edited;
			}
			await tryFollowUp();
		};
		const replyError = async (content: string) => {
			const embed = new EmbedBuilder()
				.setAuthor({
					name: "エラー",
					iconURL: ERROR_ICON_URL,
				})
				.setDescription(content)
				.setColor(0xed4245)
				.setTimestamp(new Date());
			await sendEphemeral(embed);
		};

		if (!interaction.deferred && !interaction.replied) {
			try {
				await interaction.deferReply({ flags: ["Ephemeral"] as const });
			} catch {
				// If defer fails, continue and attempt a normal reply in sendEphemeral.
			}
		}

		// ===== ファイル読み込み =====
		const admin = await readJsonData("admin.json", { users: [] as string[] });
		const blacklist = await readJsonData("blacklist.json", {
			users: [] as string[],
			servers: [] as string[],
		});

		// ===== 管理者チェック =====
		if (!admin.users.includes(interaction.user.id)) {
			await replyError("このコマンドは **Bot管理者専用** です。");
			return;
		}

		const sub = interaction.options.getSubcommand();

		// ===== server =====
		if (sub === "server") {
			const guilds = await getAllGuilds(interaction);
			const servers = guilds
				.sort((a, b) => a.shardId - b.shardId || a.name.localeCompare(b.name))
				.map((g) => `• [S${g.shardId}] ${g.name} (${g.id})`)
				.join("\n");

			const embed = new EmbedBuilder()
				.setColor(0x5865f2)
				.setAuthor({
					name: "📊 参加中サーバー一覧",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription(servers || "なし");
			await sendEphemeral(embed);
			return;
		}

		// ===== leave =====
		if (sub === "leave") {
			const id = interaction.options.getString("server_id", true);
			const result = await leaveGuildAcrossShards(interaction, id);

			if (!result) {
				await replyError("サーバーが見つかりません");
				return;
			}

			if (!result.success) {
				await replyError(`退出に失敗しました: ${result.error}`);
				return;
			}

			const embed = new EmbedBuilder()
				.setColor(0xffa500)
				.setAuthor({
					name: "🚪 退出完了",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription(
					`🚪 ${result.name} から退出しました\nShard: #${result.shardId}`,
				);
			await sendEphemeral(embed);
			return;
		}

		// ===== invite =====
		if (sub === "invite") {
			const id = interaction.options.getString("server_id", true);
			const result = await createGuildInviteAcrossShards(interaction, id);

			if (!result) {
				await replyError("見つかりません");
				return;
			}

			if (!result.success) {
				await replyError(`${result.error}`);
				return;
			}

			const embed = new EmbedBuilder()
				.setColor(0x57f287)
				.setAuthor({
					name: "🔗 招待リンク",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription(
					`${result.url}\n対象: ${result.name} (Shard #${result.shardId})`,
				);
			await sendEphemeral(embed);
			return;
		}

		// ===== member =====
		if (sub === "member") {
			const user = interaction.options.getUser("user", true);

			if (admin.users.includes(user.id)) {
				const embed = new EmbedBuilder()
					.setColor(0xfee75c)
					.setAuthor({
						name: "⚠️ 既に管理者",
						iconURL: SUCCESS_ICON_URL,
					})
					.setDescription("⚠️ このユーザーは既に管理者です。");
				await sendEphemeral(embed);
				return;
			}
			admin.users.push(user.id);
			await writeJsonData("admin.json", admin);
			const embed = new EmbedBuilder()
				.setColor(0x57f287)
				.setAuthor({
					name: "✅ 管理者追加",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription(`✅ ${user.tag} を管理者に追加しました。`);
			await sendEphemeral(embed);
			return;
		}

		// ===== stop =====
		if (sub === "stop") {
			const cmd = interaction.options.getString("command", true);
			const config = await readJsonData("config.json", { stopping: [] as string[] });
			if (config.stopping.includes(cmd)) {
				config.stopping = config.stopping.filter((c) => c !== cmd);
				await writeJsonData("config.json", config);
				const sideEffects = await Promise.allSettled([
					updateGlobalPresence(interaction.client, config.stopping),
					sendStoppedCommandsStatus(
						interaction.client,
						config.stopping,
						"resume",
						cmd,
					),
				]);
				const failures = sideEffects.filter(
					(result): result is PromiseRejectedResult =>
						result.status === "rejected",
				);
				if (failures.length > 0) {
					console.error(
						"admin: resume side-effects failed",
						failures.map((failure) => failure.reason),
					);
				}
				const embed = new EmbedBuilder()
					.setColor(failures.length > 0 ? 0xfee75c : 0x57f287)
					.setAuthor({
						name:
							failures.length > 0
								? "⚠️ 再開完了（警告あり）"
								: "✅ 再開完了",
						iconURL: SUCCESS_ICON_URL,
					})
					.setDescription(
						failures.length > 0
							? `✅ /${cmd} を再開しました（プレゼンス/通知の一部更新に失敗）`
							: `✅ /${cmd} を再開しました`,
					);
				await sendEphemeral(embed);
				return;
			}
			config.stopping.push(cmd);
			await writeJsonData("config.json", config);
			const sideEffects = await Promise.allSettled([
				updateGlobalPresence(interaction.client, config.stopping),
				sendStoppedCommandsStatus(
					interaction.client,
					config.stopping,
					"stop",
					cmd,
				),
			]);
			const failures = sideEffects.filter(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected",
			);
			if (failures.length > 0) {
				console.error(
					"admin: stop side-effects failed",
					failures.map((failure) => failure.reason),
				);
			}
			const embed = new EmbedBuilder()
				.setColor(failures.length > 0 ? 0xfee75c : 0xffa500)
				.setAuthor({
					name:
						failures.length > 0 ? "⚠️ 停止完了（警告あり）" : "⛔ 停止完了",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription(
					failures.length > 0
						? `⛔ /${cmd} を停止（プレゼンス/通知の一部更新に失敗）`
						: `⛔ /${cmd} を停止`,
				);
			await sendEphemeral(embed);
			return;
		}
		// ===== blacklist =====
		if (sub === "blacklist") {
			const type = interaction.options.getString("type", true);
			const id = interaction.options.getString("id", true);
			if (type === "user") {
				if (blacklist.users.includes(id)) {
					const embed = new EmbedBuilder()
						.setColor(0xfee75c)
						.setAuthor({
							name: "⚠️ 既に登録済み",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription("⚠️ 既に登録済み");
					await sendEphemeral(embed);
					return;
				}
				blacklist.users.push(id);
			}
			if (type === "server") {
				if (blacklist.servers.includes(id)) {
					const embed = new EmbedBuilder()
						.setColor(0xfee75c)
						.setAuthor({
							name: "⚠️ 既に登録済み",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription("⚠️ 既に登録済み");
					await sendEphemeral(embed);
					return;
				}
				blacklist.servers.push(id);
			}
			await writeJsonData("blacklist.json", blacklist);
			const embed = new EmbedBuilder()
				.setColor(0x8b0000)
				.setAuthor({
					name: "🚫 ブラックリスト追加",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription("🚫 ブラックリスト追加");
			await sendEphemeral(embed);
			return;
		}
		// ===== code =====
		if (sub === "code") {
			const script = interaction.options.getString("script", true);
			// Dual gate: BOT_OWNER_ID and ENABLE_ADMIN_EVAL
			const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
			const ENABLE_ADMIN_EVAL = process.env.ENABLE_ADMIN_EVAL;
			if (
				!BOT_OWNER_ID ||
				interaction.user.id !== BOT_OWNER_ID ||
				!ENABLE_ADMIN_EVAL
			) {
				await replyError("このコマンドは **Bot所有者専用** で、かつ環境フラグが必要です。");
				return;
			}
			try {
				// Run script in sandboxed vm context
				const util = await import("node:util");
				const vmScript = new vm.Script(script);
				let result = vmScript.runInNewContext({
					console,
					interaction,
					util,
				});
				if (typeof result !== "string") {
					result = util.inspect(result, {
						depth: 1,
					});
				}
				const embed = new EmbedBuilder()
					.setColor(0x57f287)
					.setTitle("✅ 実行結果")
					.setDescription(
						`\`\`\`js\n${String(result).slice(0, 3900)}\n\`\`\``,
					);
				await sendEphemeral(embed);
				return;
			} catch (error) {
				console.error("Admin code execution error:", error);
				await replyError(
					`❌ エラー\n\`\`\`js\n${(error instanceof Error ? (error.stack ?? error.message) : String(error)).slice(0, 3900)}\n\`\`\``,
				);
				return;
			}
		}
	},
};
export default command;
