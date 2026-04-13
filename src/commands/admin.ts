import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";
import { readJsonData, writeJsonData } from "@/utils/jsonFileStore";

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
			const servers = interaction.client.guilds.cache
				.map((g) => `• ${g.name} (${g.id})`)
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
			const guild = interaction.client.guilds.cache.get(id);

			if (!guild) {
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

			await guild.leave();

			return interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xffa500)
						.setAuthor({
							name: "🚪 退出完了",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription(`🚪 ${guild.name} から退出しました`),
				],
				flags: MessageFlags.Ephemeral,
			});
		}

		// ===== invite =====
		if (sub === "invite") {
			const id = interaction.options.getString("server_id", true);
			const guild = interaction.client.guilds.cache.get(id);

			if (!guild) {
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
			const botMember = guild.members.me;
			if (!botMember) {
				return interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({
								name: "エラー",
								iconURL: ERROR_ICON_URL,
							})
							.setDescription("❌ Botメンバー情報を取得できません"),
					],
					flags: MessageFlags.Ephemeral,
				});
			}

			const channel = guild.channels.cache.find(
				(c) =>
					c.isTextBased() &&
					c.permissionsFor(botMember)?.has("CreateInstantInvite"),
			);

			if (!channel || !("createInvite" in channel)) {
				return interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({
								name: "エラー",
								iconURL: ERROR_ICON_URL,
							})
							.setDescription("❌ 招待作れない"),
					],
					flags: MessageFlags.Ephemeral,
				});
			}

			const invite = await channel.createInvite({ maxAge: 0 });

			return interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setAuthor({
							name: "🔗 招待リンク",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription(invite.url),
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
							.setDescription(`❌ /${cmd} というコマンドはありません`),
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

				return interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setAuthor({
								name: "✅ 再開完了",
								iconURL: SUCCESS_ICON_URL,
							})
							.setDescription(`✅ /${cmd} を再開しました`),
					],
					flags: MessageFlags.Ephemeral,
				});
			}

			config.stopping.push(cmd);
			await writeJsonData("config.json", config);

			return interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xffa500)
						.setAuthor({
							name: "⛔ 停止完了",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription(`⛔ /${cmd} を停止`),
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
	},
};
