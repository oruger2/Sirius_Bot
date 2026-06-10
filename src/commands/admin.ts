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

export default {
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
       )
	),

	async execute(interaction: ChatInputCommandInteraction) {
		// ===== ファイル読み込み =====
		const admin = await readJsonData("admin.json", { users: [] as string[] });
		const blacklist = await readJsonData("blacklist.json", {
			users: [] as string[],
			servers: [] as string[],
		});

		// ===== 管理者チェック =====
		if (!admin.users.includes(interaction.user.id)) {
			return interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setAuthor({
							name: "❌ 権限エラー",
							iconURL: ERROR_ICON_URL,
						})
						.setDescription("このコマンドは **Bot管理者専用** です。"),
				],
				flags: MessageFlags.Ephemeral,
			});
		}

		const sub = interaction.options.getSubcommand();

		// ===== server =====
		if (sub === "server") {
			const guilds = await getAllGuilds(interaction);
			const servers = guilds
				.sort((a, b) => a.shardId - b.shardId || a.name.localeCompare(b.name))
				.map((g) => `• [S${g.shardId}] ${g.name} (${g.id})`)
				.join("\n");

			return interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x5865f2)
						.setAuthor({
							name: "📊 参加中サーバー一覧",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription(servers || "なし"),
				],
				flags: MessageFlags.Ephemeral,
			});
		}

		// ===== leave =====
		if (sub === "leave") {
			const id = interaction.options.getString("server_id", true);
			const result = await leaveGuildAcrossShards(interaction, id);

			if (!result) {
				return interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({
								name: "エラー",
								iconURL: ERROR_ICON_URL,
							})
							.setDescription("❌ サーバーが見つかりません"),
					],
					flags: MessageFlags.Ephemeral,
				});
			}

			if (!result.success) {
				return interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({
								name: "エラー",
								iconURL: ERROR_ICON_URL,
							})
							.setDescription(`❌ 退出に失敗しました: ${result.error}`),
					],
					flags: MessageFlags.Ephemeral,
				});
			}

			return interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xffa500)
						.setAuthor({
							name: "🚪 退出完了",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription(
							`🚪 ${result.name} から退出しました\nShard: #${result.shardId}`,
						),
				],
				flags: MessageFlags.Ephemeral,
			});
		}

		// ===== invite =====
		if (sub === "invite") {
			const id = interaction.options.getString("server_id", true);
			const result = await createGuildInviteAcrossShards(interaction, id);

			if (!result) {
				return interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({
								name: "エラー",
								iconURL: ERROR_ICON_URL,
							})
							.setDescription("❌ 見つかりません"),
					],
					flags: MessageFlags.Ephemeral,
				});
			}

			if (!result.success) {
				return interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({
								name: "エラー",
								iconURL: ERROR_ICON_URL,
							})
							.setDescription(`❌ ${result.error}`),
					],
					flags: MessageFlags.Ephemeral,
				});
			}

			return interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setAuthor({
							name: "🔗 招待リンク",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription(
							`${result.url}\n対象: ${result.name} (Shard #${result.shardId})`,
						),
				],
				flags: MessageFlags.Ephemeral,
			});
		}

		// ===== member =====
		if (sub === "member") {
			const user = interaction.options.getUser("user", true);

			if (admin.users.includes(user.id)) {
				return interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xfee75c)
							.setAuthor({
								name: "⚠️ 既に登録済み",
								iconURL: SUCCESS_ICON_URL,
							})
							.setDescription("⚠️ 既に登録済み"),
					],
					flags: MessageFlags.Ephemeral,
				});
			}

			admin.users.push(user.id);
			await writeJsonData("admin.json", admin);

			return interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setAuthor({
							name: "✅ 追加完了",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription(`✅ ${user.tag} を追加`),
				],
				flags: MessageFlags.Ephemeral,
			});
		}

		// ===== stop =====
		if (sub === "stop") {
			const input = interaction.options.getString("command", true);
			const cmd = input.replace(/^\//, "").toLowerCase();
			const commandRegistry = (
				interaction.client as { commands?: { has: (name: string) => boolean } }
			).commands;

			if (!commandRegistry?.has(cmd)) {
				return interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({
								name: "エラー",
								iconURL: ERROR_ICON_URL,
							})
							.setDescription("❌ 実在するコマンドを入力してください。"),
					],
					flags: MessageFlags.Ephemeral,
				});
			}

			let config = { stopping: [] as string[] };

			config = await readJsonData("config.json", config);

			const stopIndex = config.stopping.indexOf(cmd);

			if (stopIndex !== -1) {
				config.stopping.splice(stopIndex, 1);
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

				return interaction.reply({
					embeds: [
						new EmbedBuilder()
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
							),
					],
					flags: MessageFlags.Ephemeral,
				});
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

			return interaction.reply({
				embeds: [
					new EmbedBuilder()
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
						),
				],
				flags: MessageFlags.Ephemeral,
			});
		}

		// ===== blacklist =====
		if (sub === "blacklist") {
			const type = interaction.options.getString("type", true);
			const id = interaction.options.getString("id", true);

			if (type === "user") {
				if (blacklist.users.includes(id)) {
					return interaction.reply({
						embeds: [
							new EmbedBuilder()
								.setColor(0xfee75c)
								.setAuthor({
									name: "⚠️ 既に登録済み",
									iconURL: SUCCESS_ICON_URL,
								})
								.setDescription("⚠️ 既に登録済み"),
						],
						flags: MessageFlags.Ephemeral,
					});
				}
				blacklist.users.push(id);
			}

			if (type === "server") {
				if (blacklist.servers.includes(id)) {
					return interaction.reply({
						embeds: [
							new EmbedBuilder()
								.setColor(0xfee75c)
								.setAuthor({
									name: "⚠️ 既に登録済み",
									iconURL: SUCCESS_ICON_URL,
								})
								.setDescription("⚠️ 既に登録済み"),
						],
						flags: MessageFlags.Ephemeral,
					});
				}
				blacklist.servers.push(id);
			}

			await writeJsonData("blacklist.json", blacklist);

			return interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x8b0000)
						.setAuthor({
							name: "🚫 ブラックリスト追加",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription("🚫 ブラックリスト追加"),
				],
				flags: MessageFlags.Ephemeral,
			});
	}
	// ===== code =====
	if (sub === "code") {
		const script = interaction.options.getString("script", true);

		try {
			let result = await eval(`(async () => { ${script} })()`);

			if (typeof result !== "string") {
				result = require("util").inspect(result, {
					depth: 1,
				});
			}

			return interaction.reply({
	        		embeds: [
	         			new EmbedBuilder()
	         				.setColor(0x57f287)
	        				.setTitle("✅ 実行結果")
	        				.setDescription(
	        					`\`\`\`js\n${String(result).slice(0, 3900)}\n\`\`\``,
	         				),
	        		],
	        		flags: MessageFlags.Ephemeral,
	         	});
		} catch (error) {
			return interaction.reply({
	         		embeds: [
	        			new EmbedBuilder()
	        				.setColor(0xed4245)
		        			.setTitle("❌ エラー")
	        				.setDescription(
	        					`\`\`\`js\n${error instanceof Error ? error.stack : String(error)}\n\`\`\``,
		        			),
		        	],
		        	flags: MessageFlags.Ephemeral,
	        	});
	         }
         }
	},
};
