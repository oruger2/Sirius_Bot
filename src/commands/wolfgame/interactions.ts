import type { ButtonInteraction, ModalSubmitInteraction } from "discord.js";
import {
	ActionRowBuilder,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import {
	MAX_PLAYERS,
	MIN_PLAYERS,
	ROLE_INFO,
	validateResolvedRoleConfig,
	parseMinuteInput,
	parseWholeNumber,
	resolveRoleConfig,
	roleConfigForPlayerCount,
} from "./constants";
import { sessionsByGameId } from "./registry";
import { WolfGameSession } from "./session";
import type { ConfigurableRole, FreaksAffiliation, Role } from "./types";

const handleRecruitButton = async (
	session: WolfGameSession,
	button: ButtonInteraction,
	action:
		| "join"
		| "leave"
		| "start"
		| "dismiss"
		| "config_wolf_roles"
		| "config_village_roles"
		| "config_third_roles"
		| "config_game_rules",
) => {
	if (
		action === "config_wolf_roles" ||
		action === "config_village_roles" ||
		action === "config_third_roles" ||
		action === "config_game_rules"
	) {
		if (button.user.id !== session.hostId) {
			await button.reply({
				content: "設定できるのは主催者のみです。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (session.phase !== "recruiting") {
			await button.reply({
				content: "設定できるのは募集中のみです。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const baseConfig = roleConfigForPlayerCount(
			Math.max(session.participantCount(), MIN_PLAYERS),
		);
		const roleValue = (role: ConfigurableRole) =>
			String(session.settings.roleOverrides[role] ?? baseConfig[role]);

		const modal =
			action === "config_wolf_roles"
				? new ModalBuilder()
						.setCustomId(`wolf:modal_wolf_roles:${session.gameId}`)
						.setTitle("人狼用役職設定")
						.addComponents(
							new ActionRowBuilder<TextInputBuilder>().addComponents(
								new TextInputBuilder()
									.setCustomId("werewolf")
									.setLabel("人狼")
									.setStyle(TextInputStyle.Short)
									.setRequired(true)
									.setValue(roleValue("werewolf")),
							),
							new ActionRowBuilder<TextInputBuilder>().addComponents(
								new TextInputBuilder()
									.setCustomId("wolf_cat")
									.setLabel("猫又(人狼)")
									.setStyle(TextInputStyle.Short)
									.setRequired(true)
									.setValue(roleValue("wolf_cat")),
							),
							new ActionRowBuilder<TextInputBuilder>().addComponents(
								new TextInputBuilder()
									.setCustomId("madman")
									.setLabel("狂人")
									.setStyle(TextInputStyle.Short)
									.setRequired(true)
									.setValue(roleValue("madman")),
							),
						)
				: action === "config_village_roles"
					? new ModalBuilder()
							.setCustomId(`wolf:modal_village_roles:${session.gameId}`)
							.setTitle("村人用役職設定")
							.addComponents(
								new ActionRowBuilder<TextInputBuilder>().addComponents(
									new TextInputBuilder()
										.setCustomId("seer")
										.setLabel("占い師")
										.setStyle(TextInputStyle.Short)
										.setRequired(true)
										.setValue(roleValue("seer")),
								),
								new ActionRowBuilder<TextInputBuilder>().addComponents(
									new TextInputBuilder()
										.setCustomId("knight")
										.setLabel("騎士")
										.setStyle(TextInputStyle.Short)
										.setRequired(true)
										.setValue(roleValue("knight")),
								),
								new ActionRowBuilder<TextInputBuilder>().addComponents(
									new TextInputBuilder()
										.setCustomId("medium")
										.setLabel("霊媒師")
										.setStyle(TextInputStyle.Short)
										.setRequired(true)
										.setValue(roleValue("medium")),
								),
								new ActionRowBuilder<TextInputBuilder>().addComponents(
									new TextInputBuilder()
										.setCustomId("nice_cat")
										.setLabel("ナイス猫又(村人)")
										.setStyle(TextInputStyle.Short)
										.setRequired(true)
										.setValue(roleValue("nice_cat")),
								),
							)
					: action === "config_third_roles"
						? new ModalBuilder()
								.setCustomId(`wolf:modal_third_roles:${session.gameId}`)
								.setTitle("第三勢力役職設定")
								.addComponents(
									new ActionRowBuilder<TextInputBuilder>().addComponents(
										new TextInputBuilder()
											.setCustomId("fox")
											.setLabel("きつね")
											.setStyle(TextInputStyle.Short)
											.setRequired(true)
											.setValue(roleValue("fox")),
									),
									new ActionRowBuilder<TextInputBuilder>().addComponents(
										new TextInputBuilder()
											.setCustomId("freaks")
											.setLabel("フリークス")
											.setStyle(TextInputStyle.Short)
											.setRequired(true)
											.setValue(roleValue("freaks")),
									),
									new ActionRowBuilder<TextInputBuilder>().addComponents(
										new TextInputBuilder()
											.setCustomId("teruteru")
											.setLabel("てるてる")
											.setStyle(TextInputStyle.Short)
											.setRequired(true)
											.setValue(roleValue("teruteru")),
									),
								)
						: new ModalBuilder()
								.setCustomId(`wolf:modal_game_rules:${session.gameId}`)
								.setTitle("ゲーム設定")
								.addComponents(
									new ActionRowBuilder<TextInputBuilder>().addComponents(
										new TextInputBuilder()
											.setCustomId("discussionMinutes")
											.setLabel("議論時間(分)")
											.setStyle(TextInputStyle.Short)
											.setRequired(true)
											.setValue(String(session.settings.discussionMs / 60_000)),
									),
									new ActionRowBuilder<TextInputBuilder>().addComponents(
										new TextInputBuilder()
											.setCustomId("voteMinutes")
											.setLabel("投票時間(分)")
											.setStyle(TextInputStyle.Short)
											.setRequired(true)
											.setValue(String(session.settings.voteMs / 60_000)),
									),
								);

		await button.showModal(modal);
		return;
	}

	if (action === "dismiss") {
		if (button.user.id !== session.hostId) {
			await button.reply({
				content: "解散できるのは主催者のみです。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		await button.reply({
			content: "ロビーを解散します。",
			flags: MessageFlags.Ephemeral,
		});
		await session.endGame("主催者がロビーを解散しました。");
		return;
	}

	if (session.phase !== "recruiting") {
		await button.reply({
			content: "この募集はすでに締め切られています。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (action === "join") {
		if (session.isParticipant(button.user.id)) {
			await button.reply({
				content: "あなたはすでにこのゲームに参加しています。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (session.participantCount() >= MAX_PLAYERS) {
			await button.reply({
				content: `参加可能人数は最大${MAX_PLAYERS}人です。`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		session.participants.add(button.user.id);
		session.bumpActivity();
		await session.updateRecruitMessage();
		await button.reply({
			content: "参加しました。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (action === "leave") {
		if (button.user.id === session.hostId) {
			await button.reply({
				content:
					"主催者は離脱できません。終了する場合は開始せずに放置せず、再度コマンド実行してください。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (!session.isParticipant(button.user.id)) {
			await button.reply({
				content: "あなたは参加していません。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		session.participants.delete(button.user.id);
		session.bumpActivity();
		await session.updateRecruitMessage();
		await button.reply({
			content: "離脱しました。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (action === "start") {
		if (button.user.id !== session.hostId) {
			await button.reply({
				content: "開始できるのは主催者のみです。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await session.startGame(button);
	}
};

const processNightAction = (
	session: WolfGameSession,
	actorId: string,
	role: Role,
	targetId: string,
) => {
	if (session.phase !== "night") {
		return { ok: false, content: "現在は夜フェーズではありません。" };
	}

	if (!["werewolf", "seer", "knight", "medium", "freaks"].includes(role)) {
		return {
			ok: false,
			content: "この役職アクションは現在サポートされていません。",
		};
	}

	const actor = session.players.get(actorId);
	const canActAsRole =
		role === "werewolf"
			? actor?.role === "werewolf" || actor?.role === "wolf_cat"
			: actor?.role === role;
	if (!actor?.alive || !canActAsRole) {
		return { ok: false, content: "あなたはこのアクションを実行できません。" };
	}

	const rep = session.nightRepresentatives.get(role);
	if (rep && rep !== actorId) {
		return {
			ok: false,
			content: `この役職のアクションは代表者 <@${rep}> のみ実行できます。`,
		};
	}

	if (role === "freaks") {
		const targetTeam = targetId as FreaksAffiliation;
		if (!["village", "werewolf", "third"].includes(targetTeam)) {
			return { ok: false, content: "所属陣営の指定が無効です。" };
		}
		session.nightActions.freaks = targetTeam;
		session.freaksAffiliations.set(actorId, targetTeam);
		session.pendingNightRoles.delete(role);
		session.bumpActivity();

		if (session.pendingNightRoles.size === 0 && session.nightResolver) {
			session.nightResolver();
		}

		const teamLabel =
			targetTeam === "village"
				? "村人陣営"
				: targetTeam === "werewolf"
					? "人狼陣営"
					: "第三陣営";
		return {
			ok: true,
			content: `今夜の所属陣営を **${teamLabel}** に変更しました。`,
		};
	}

	const target = session.players.get(targetId);
	if (!target) {
		return { ok: false, content: "対象が無効です。" };
	}

	if (role === "medium") {
		if (target.alive) {
			return { ok: false, content: "霊媒師は死亡者のみ選択できます。" };
		}
		if (session.mediumInspected.has(targetId)) {
			return { ok: false, content: "その対象はすでに霊媒済みです。" };
		}
	} else if (!target.alive) {
		return { ok: false, content: "対象が無効です。" };
	}

	if (
		role === "werewolf" &&
		(target.role === "werewolf" || target.role === "wolf_cat")
	) {
		return { ok: false, content: "人狼は人狼を襲撃できません。" };
	}

	if (role === "seer" && targetId === actorId) {
		return { ok: false, content: "自分自身は占えません。" };
	}

	if (role === "knight" && targetId === actorId) {
		return { ok: false, content: "騎士は自分自身を護衛できません。" };
	}

	if (role === "werewolf") session.nightActions.werewolf = targetId;
	if (role === "seer") session.nightActions.seer = targetId;
	if (role === "knight") session.nightActions.knight = targetId;
	if (role === "medium") session.nightActions.medium = targetId;

	session.pendingNightRoles.delete(role);
	session.bumpActivity();

	if (session.pendingNightRoles.size === 0 && session.nightResolver) {
		session.nightResolver();
	}

	return {
		ok: true,
		content: `${ROLE_INFO[role].name}のアクションを **${session.nameOf(targetId)}** に設定しました。`,
	};
};

const handleActionButton = async (
	session: WolfGameSession,
	button: ButtonInteraction,
	role: Role,
	targetId: string,
) => {
	const result = processNightAction(session, button.user.id, role, targetId);
	await button.reply({
		content: result.content,
		flags: MessageFlags.Ephemeral,
	});
};

const handleVoteButton = async (
	session: WolfGameSession,
	button: ButtonInteraction,
	targetId: string,
) => {
	if (session.phase !== "vote") {
		await button.reply({
			content: "現在は投票フェーズではありません。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const voter = session.players.get(button.user.id);
	if (!voter?.alive) {
		await button.reply({
			content: "生存者のみ投票できます。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (targetId === "skip") {
		session.votes.set(button.user.id, "skip");
		session.pendingVoters.delete(button.user.id);
		session.bumpActivity();
		await session.postOrUpdateVoteProgress();

		await button.reply({
			content: "投票をスキップしました。",
			flags: MessageFlags.Ephemeral,
		});

		if (session.pendingVoters.size === 0 && session.dayResolver) {
			session.dayResolver();
		}
		return;
	}

	if (targetId === button.user.id) {
		await button.reply({
			content: "自分自身には投票できません。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const target = session.players.get(targetId);
	if (!target?.alive) {
		await button.reply({
			content: "その対象には投票できません。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	session.votes.set(button.user.id, targetId);
	session.pendingVoters.delete(button.user.id);
	session.bumpActivity();
	await session.postOrUpdateVoteProgress();

	await button.reply({
		content: `**${session.nameOf(targetId)}** に投票しました。`,
		flags: MessageFlags.Ephemeral,
	});

	if (session.pendingVoters.size === 0 && session.dayResolver) {
		session.dayResolver();
	}
};

const handleDiscussionSkipButton = async (
	session: WolfGameSession,
	button: ButtonInteraction,
) => {
	if (session.phase !== "discussion") {
		await button.reply({
			content: "現在は議論フェーズではありません。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const player = session.players.get(button.user.id);
	if (!player?.alive) {
		await button.reply({
			content: "生存者のみ議論スキップに投票できます。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (session.discussionSkippers.has(button.user.id)) {
		await button.reply({
			content: "あなたはすでに議論スキップに投票済みです。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	session.discussionSkippers.add(button.user.id);
	session.bumpActivity();
	await session.updateDiscussionSkipControl();

	const total = session.alivePlayerIds().length;
	const skipped = session.discussionSkippers.size;

	await button.reply({
		content: `議論スキップに投票しました。(${skipped}/${total})`,
		flags: MessageFlags.Ephemeral,
	});

	if (skipped >= total && session.discussionResolver) {
		const main = await session.getMainChannel();
		if (main) {
			await main.send({
				content: "全員が議論スキップに投票したため、議論フェーズを終了します。",
			});
		}
		session.discussionResolver();
	}
};

const handleForceEndButton = async (
	session: WolfGameSession,
	button: ButtonInteraction,
) => {
	if (button.user.id !== session.hostId) {
		await button.reply({
			content: "強制終了できるのはホストのみです。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await button.reply({
		content: "ゲームを強制終了します。",
		flags: MessageFlags.Ephemeral,
	});
	await session.endGame("ホストが強制終了しました。");
};

export const handleWolfGameModalInteraction = async (
	interaction: ModalSubmitInteraction,
) => {
	if (!interaction.customId.startsWith("wolf:modal_")) {
		return false;
	}

	const parts = interaction.customId.split(":");
	const action = parts[1];
	const gameId = parts[2];
	if (!action || !gameId) return true;

	const session = sessionsByGameId.get(gameId);
	if (!session || session.closed) {
		await interaction.reply({
			content: "このゲームはすでに終了しています。",
			flags: MessageFlags.Ephemeral,
		});
		return true;
	}

	if (interaction.user.id !== session.hostId) {
		await interaction.reply({
			content: "設定できるのは主催者のみです。",
			flags: MessageFlags.Ephemeral,
		});
		return true;
	}

	if (session.phase !== "recruiting") {
		await interaction.reply({
			content: "設定できるのは募集中のみです。",
			flags: MessageFlags.Ephemeral,
		});
		return true;
	}

	const applyRoleOverrides = async (
		roleValues: Partial<Record<ConfigurableRole, string>>,
		successMessage: string,
	) => {
		const nextOverrides = { ...session.settings.roleOverrides };
		for (const [role, rawValue] of Object.entries(roleValues)) {
			const typedRole = role as ConfigurableRole;
			const parsed = parseWholeNumber(rawValue ?? "", ROLE_INFO[typedRole].name);
			if (!parsed.ok) {
				await interaction.reply({
					content: parsed.message,
					flags: MessageFlags.Ephemeral,
				});
				return true;
			}
			nextOverrides[typedRole] = parsed.value;
		}

		if (
			!resolveRoleConfig(
				Math.max(session.participantCount(), MIN_PLAYERS),
				nextOverrides,
			)
		) {
			const targetCount = Math.max(session.participantCount(), MIN_PLAYERS);
			const resolved = roleConfigForPlayerCount(targetCount);
			for (const role of Object.keys(nextOverrides) as ConfigurableRole[]) {
				const override = nextOverrides[role];
				if (typeof override === "number") {
					resolved[role] = override;
				}
			}
			resolved.villager =
				targetCount -
				(Object.entries(resolved)
					.filter(([role]) => role !== "villager")
					.reduce((sum, [, value]) => sum + value, 0) || 0);
			const reason =
				validateResolvedRoleConfig(targetCount, resolved) ??
				"その役職設定だと参加人数に対して役職数が多すぎます。数を減らしてください。";
			await interaction.reply({
				content: reason,
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}

		session.settings.roleOverrides = nextOverrides;
		session.bumpActivity();
		await session.updateRecruitMessage();
		await interaction.reply({
			content: successMessage,
			flags: MessageFlags.Ephemeral,
		});
		return true;
	};

	if (action === "modal_wolf_roles") {
		return applyRoleOverrides(
			{
				werewolf: interaction.fields.getTextInputValue("werewolf"),
				wolf_cat: interaction.fields.getTextInputValue("wolf_cat"),
				madman: interaction.fields.getTextInputValue("madman"),
			},
			"人狼用役職設定を更新しました。",
		);
	}

	if (action === "modal_village_roles") {
		return applyRoleOverrides(
			{
				seer: interaction.fields.getTextInputValue("seer"),
				knight: interaction.fields.getTextInputValue("knight"),
				medium: interaction.fields.getTextInputValue("medium"),
				nice_cat: interaction.fields.getTextInputValue("nice_cat"),
			},
			"村人用役職設定を更新しました。",
		);
	}

	if (action === "modal_third_roles") {
		return applyRoleOverrides(
			{
				fox: interaction.fields.getTextInputValue("fox"),
				freaks: interaction.fields.getTextInputValue("freaks"),
				teruteru: interaction.fields.getTextInputValue("teruteru"),
			},
			"第三勢力役職設定を更新しました。",
		);
	}

	if (action === "modal_game_rules") {
		const discussion = parseMinuteInput(
			interaction.fields.getTextInputValue("discussionMinutes"),
			"議論時間",
		);
		const vote = parseMinuteInput(
			interaction.fields.getTextInputValue("voteMinutes"),
			"投票時間",
		);

		for (const result of [discussion, vote]) {
			if (!result.ok) {
				await interaction.reply({
					content: result.message,
					flags: MessageFlags.Ephemeral,
				});
				return true;
			}
		}

		if (!discussion.ok || !vote.ok) {
			return true;
		}

		session.settings.discussionMs = discussion.value;
		session.settings.voteMs = vote.value;
		session.bumpActivity();
		await session.updateRecruitMessage();
		await interaction.reply({
			content: "ゲーム設定を更新しました。",
			flags: MessageFlags.Ephemeral,
		});
		return true;
	}

	return true;
};

const handleNightActionAcrossShards = async (
	interaction: ButtonInteraction,
	role: Role,
	targetId: string,
) => {
	const shardClient = interaction.client.shard;
	if (!shardClient) return false;

	const responses = await shardClient.broadcastEval(
		(_, ctx) => {
			const bridge = (
				globalThis as {
					__wolfgameHandleRemoteNightAction?: (
						customId: string,
						userId: string,
					) => { handled: boolean; content: string } | null;
				}
			).__wolfgameHandleRemoteNightAction;

			if (!bridge) return null;
			return bridge(ctx.customId, ctx.userId);
		},
		{
			context: {
				customId: `wolf:act:${interaction.customId.split(":")[2]}:${role}:${targetId}`,
				userId: interaction.user.id,
			},
		},
	);

	const hit = responses.find((item) => item?.handled);
	if (!hit) return false;

	await interaction.reply({
		content: hit.content,
		flags: MessageFlags.Ephemeral,
	});
	return true;
};

(
	globalThis as {
		__wolfgameHandleRemoteNightAction?: (
			customId: string,
			userId: string,
		) => { handled: boolean; content: string } | null;
	}
).__wolfgameHandleRemoteNightAction = (customId, userId) => {
	const parts = customId.split(":");
	if (parts[1] !== "act") return null;
	const gameId = parts[2];
	const role = parts[3] as Role | undefined;
	const targetId = parts[4];
	if (!gameId || !role || !targetId) return null;

	const session = sessionsByGameId.get(gameId);
	if (!session || session.closed) return null;

	const result = processNightAction(session, userId, role, targetId);
	return { handled: true, content: result.content };
};

export const handleWolfGameButtonInteraction = async (
	interaction: ButtonInteraction,
) => {
	if (!interaction.customId.startsWith("wolf:")) {
		return false;
	}

	const parts = interaction.customId.split(":");
	if (parts.length < 3) return true;

	const action = parts[1];
	const gameId = parts[2];
	const session = sessionsByGameId.get(gameId);

	if (!session || session.closed) {
		if (action === "act") {
			const role = parts[3] as Role | undefined;
			const targetId = parts[4];
			if (role && targetId) {
				const handled = await handleNightActionAcrossShards(
					interaction,
					role,
					targetId,
				);
				if (handled) return true;
			}
		}

		await interaction.reply({
			content: "このゲームはすでに終了しています。",
			flags: MessageFlags.Ephemeral,
		});
		return true;
	}

	if (
		action === "join" ||
		action === "leave" ||
		action === "start" ||
		action === "dismiss" ||
		action === "config_wolf_roles" ||
		action === "config_village_roles" ||
		action === "config_third_roles" ||
		action === "config_game_rules"
	) {
		await handleRecruitButton(session, interaction, action);
		return true;
	}

	if (action === "force_end") {
		await handleForceEndButton(session, interaction);
		return true;
	}

	if (action === "discussion_skip") {
		await handleDiscussionSkipButton(session, interaction);
		return true;
	}

	if (action === "act") {
		const role = parts[3] as Role | undefined;
		const targetId = parts[4];
		if (!role || !targetId) {
			await interaction.reply({
				content: "不正なアクションです。",
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}
		await handleActionButton(session, interaction, role, targetId);
		return true;
	}

	if (action === "vote") {
		const targetId = parts[3];
		if (!targetId) {
			await interaction.reply({
				content: "不正な投票です。",
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}
		await handleVoteButton(session, interaction, targetId);
		return true;
	}

	return true;
};
