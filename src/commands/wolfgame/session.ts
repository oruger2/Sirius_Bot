import type { ButtonInteraction, Client, Guild } from "discord.js";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	ComponentType,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
} from "discord.js";
import {
	chunk,
	DEFAULT_DISCUSSION_MS,
	DEFAULT_VOTE_MS,
	formatDurationMinutes,
	formatRoleConfig,
	INACTIVITY_MS,
	MAX_PLAYERS,
	MIN_PLAYERS,
	makeId,
	NIGHT_ACTION_MS,
	pickRandom,
	resolveRoleConfig,
	roleArrayFromConfig,
	roleConfigForPlayerCount,
	sleep,
	sleep,
	validateResolvedRoleConfig,
} from "./constants";
import { sessionsByGameId, sessionsByGuild } from "./registry";
import type {
	FreaksAffiliation,
	NightActions,
	Phase,
	PlayerState,
	Role,
	Team,
	WolfGameSettings,
} from "./types";

export class WolfGameSession {
	readonly gameId: string;
	readonly guildId: string;
	readonly hostId: string;
	readonly sourceChannelId: string;
	readonly client: Client;

	phase: Phase = "recruiting";
	participants = new Set<string>();
	players = new Map<string, PlayerState>();
	playerNames = new Map<string, string>();

	recruitMessageId: string | null = null;
	mainChannelId: string | null = null;

	idleTimer: NodeJS.Timeout | null = null;
	phaseTimer: NodeJS.Timeout | null = null;
	nightResolver: (() => void) | null = null;
	discussionResolver: (() => void) | null = null;
	dayResolver: (() => void) | null = null;

	nightActions: NightActions = {};
	pendingNightRoles = new Set<Role>();
	nightRepresentatives = new Map<Role, string>();
	votes = new Map<string, string>();
	pendingVoters = new Set<string>();
	discussionSkippers = new Set<string>();
	discussionControlMessageId: string | null = null;
	voteActionMessageId: string | null = null;
	voteProgressMessageId: string | null = null;
	mediumInspected = new Set<string>();
	freaksAffiliations = new Map<string, FreaksAffiliation>();
	teruteruWinnerId: string | null = null;
	settings: WolfGameSettings = {
		discussionMs: DEFAULT_DISCUSSION_MS,
		voteMs: DEFAULT_VOTE_MS,
		roleOverrides: {},
	};
	forcedWinReason: string | null = null;

	round = 0;
	closed = false;

	constructor(args: {
		client: Client;
		guildId: string;
		hostId: string;
		sourceChannelId: string;
	}) {
		this.client = args.client;
		this.guildId = args.guildId;
		this.hostId = args.hostId;
		this.sourceChannelId = args.sourceChannelId;
		this.gameId = makeId();
		this.participants.add(args.hostId);
		this.bumpActivity();
	}

	private clearTimers() {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		if (this.phaseTimer) {
			clearTimeout(this.phaseTimer);
			this.phaseTimer = null;
		}
	}

	bumpActivity() {
		if (this.closed) return;
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = setTimeout(() => {
			void this.endGame(
				"15分間アクションがなかったため、ゲームを強制終了しました。",
			);
		}, INACTIVITY_MS);
		this.idleTimer.unref?.();
	}

	async fetchGuild() {
		const cached = this.client.guilds.cache.get(this.guildId);
		if (cached) return cached;
		return await this.client.guilds.fetch(this.guildId);
	}

	async fetchMemberName(guild: Guild, userId: string) {
		try {
			const member =
				guild.members.cache.get(userId) ?? (await guild.members.fetch(userId));
			return member.displayName;
		} catch {
			return `ユーザー(${userId.slice(0, 6)})`;
		}
	}

	buildRecruitEmbed() {
		const count = this.participants.size;
		const previewCount = Math.max(count, MIN_PLAYERS);
		const config = resolveRoleConfig(previewCount, this.settings.roleOverrides);
		const participantText = [...this.participants]
			.map((id) => `<@${id}>`)
			.join("\n");
		const actualConfig = resolveRoleConfig(count, this.settings.roleOverrides);

		const embed = new EmbedBuilder()
			.setTitle("人狼ゲーム参加者募集")
			.setColor(0x4e5d94)
			.setDescription(
				[
					`参加人数: **${count}/${MAX_PLAYERS}** (開始は${MIN_PLAYERS}人以上)`,
					"",
					"参加ボタンでエントリー、主催者が開始ボタンでゲーム開始できます。",
					"",
					"現在の参加者:",
					participantText || "まだいません",
				]
					.filter(Boolean)
					.join("\n"),
			)
			.addFields({
				name: `${previewCount}人時の役職構成`,
				value: config
					? formatRoleConfig(config)
					: "現在の設定だと役職数が参加人数を超えています。",
			})
			.addFields({
				name: "時間設定",
				value: `議論: ${formatDurationMinutes(this.settings.discussionMs)} / 投票: ${formatDurationMinutes(this.settings.voteMs)}`,
			})
			.setFooter({ text: "5〜15人でプレイできます" })
			.setTimestamp();

		if (!actualConfig && count > 0) {
			embed.addFields({
				name: "開始前チェック",
				value:
					"現在の参加人数では役職数が多すぎるため、このままでは開始できません。",
			});
		}

		return embed;
	}

	buildRecruitButtons(disabled = false) {
		return [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`wolf:join:${this.gameId}`)
					.setLabel("参加")
					.setStyle(ButtonStyle.Success)
					.setDisabled(disabled),
				new ButtonBuilder()
					.setCustomId(`wolf:leave:${this.gameId}`)
					.setLabel("離脱")
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(disabled),
				new ButtonBuilder()
					.setCustomId(`wolf:start:${this.gameId}`)
					.setLabel("開始")
					.setStyle(ButtonStyle.Primary)
					.setDisabled(disabled),
				new ButtonBuilder()
					.setCustomId(`wolf:dismiss:${this.gameId}`)
					.setLabel("解散")
					.setStyle(ButtonStyle.Danger)
					.setDisabled(disabled),
			),
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`wolf:config_wolf_roles:${this.gameId}`)
					.setLabel("人狼用役職設定")
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(disabled),
				new ButtonBuilder()
					.setCustomId(`wolf:config_village_roles:${this.gameId}`)
					.setLabel("村人用役職設定")
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(disabled),
				new ButtonBuilder()
					.setCustomId(`wolf:config_third_roles:${this.gameId}`)
					.setLabel("第三勢力役職設定")
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(disabled),
				new ButtonBuilder()
					.setCustomId(`wolf:config_game_rules:${this.gameId}`)
					.setLabel("ゲーム設定")
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(disabled),
			),
		];
	}

	async updateRecruitMessage() {
		if (!this.recruitMessageId) return;
		try {
			const guild = await this.fetchGuild();
			const channel = guild.channels.cache.get(this.sourceChannelId);
			if (!channel?.isTextBased() || channel.isDMBased()) return;
			const message = await channel.messages.fetch(this.recruitMessageId);
			await message.edit({
				embeds: [this.buildRecruitEmbed()],
				components: this.buildRecruitButtons(this.phase !== "recruiting"),
			});
		} catch {
			// ignore
		}
	}

	async disableRecruitButtons() {
		if (!this.recruitMessageId) return;
		try {
			const guild = await this.fetchGuild();
			const channel = guild.channels.cache.get(this.sourceChannelId);
			if (!channel?.isTextBased() || channel.isDMBased()) return;
			const message = await channel.messages.fetch(this.recruitMessageId);
			await message.edit({ components: this.buildRecruitButtons(true) });
		} catch {
			// ignore
		}
	}

	async postSourceMessage(content: string) {
		try {
			const guild = await this.fetchGuild();
			const source = guild.channels.cache.get(this.sourceChannelId);
			if (!source?.isTextBased() || source.isDMBased()) return;
			await source.send({ content });
		} catch {
			// ignore
		}
	}

	async postStartControlMessage() {
		try {
			const guild = await this.fetchGuild();
			const source = guild.channels.cache.get(this.sourceChannelId);
			if (!source?.isTextBased() || source.isDMBased()) return;

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`wolf:force_end:${this.gameId}`)
					.setLabel("強制終了")
					.setStyle(ButtonStyle.Danger),
			);

			await source.send({
				content: `人狼ゲームを開始します。<#${this.mainChannelId}>`,
				components: [row],
			});
		} catch {
			// ignore
		}
	}

	alivePlayers() {
		return [...this.players.values()].filter((p) => p.alive);
	}

	alivePlayerIds() {
		return this.alivePlayers().map((p) => p.id);
	}

	aliveByRole(role: Role) {
		return this.alivePlayers().filter((p) => p.role === role);
	}

	effectiveTeamOf(player: PlayerState): Team {
		if (player.role !== "freaks") {
			return ROLE_INFO[player.role].team;
		}
		const affiliation = this.freaksAffiliations.get(player.id) ?? "third";
		if (affiliation === "village") return "village";
		if (affiliation === "werewolf") return "werewolf";
		return "freaks";
	}

	deadUninspectedPlayers() {
		return [...this.players.values()].filter(
			(player) => !player.alive && !this.mediumInspected.has(player.id),
		);
	}

	isParticipant(userId: string) {
		return this.participants.has(userId);
	}

	participantCount() {
		return this.participants.size;
	}

	async assignRolesAndCacheNames(guild: Guild) {
		const ids = shuffle([...this.participants]);
		const roleConfig = resolveRoleConfig(
			ids.length,
			this.settings.roleOverrides,
		);
		if (!roleConfig) {
			throw new Error(
				"Invalid wolfgame role configuration for participant count",
			);
		}
		const roles = shuffle(roleArrayFromConfig(roleConfig));

		ids.forEach((id, index) => {
			const role = roles[index] as Role | undefined;
			if (!role) return;
			this.players.set(id, { id, role, alive: true });
		});

		this.freaksAffiliations.clear();
		for (const player of this.players.values()) {
			if (player.role === "freaks") {
				this.freaksAffiliations.set(player.id, "third");
			}
		}

		for (const id of ids) {
			const name = await this.fetchMemberName(guild, id);
			this.playerNames.set(id, name);
		}
	}

	nameOf(userId: string) {
		return this.playerNames.get(userId) ?? `ユーザー(${userId.slice(0, 6)})`;
	}

	async setupGameChannels(guild: Guild) {
		const botMember = guild.members.me ?? (await guild.members.fetchMe());
		const botId = botMember.id;

		const baseOverwrites = [
			{
				id: guild.roles.everyone.id,
				deny: [PermissionFlagsBits.ViewChannel],
			},
			{
				id: botId,
				allow: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.SendMessages,
					PermissionFlagsBits.ManageChannels,
				],
			},
		] as const;

		const mainPermissionOverwrites = [
			...baseOverwrites,
			...[...this.participants].map((id) => ({
				id,
				allow: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.SendMessages,
				],
			})),
		];

		const mainChannel = await guild.channels.create({
			name: "人狼ゲーム会話",
			type: ChannelType.GuildText,
			permissionOverwrites: mainPermissionOverwrites,
			topic: `wolfgame:${this.gameId}`,
		});

		this.mainChannelId = mainChannel.id;
	}

	async dmRoleNotifications(guild: Guild) {
		const werewolves = this.alivePlayers()
			.filter(
				(player) => player.role === "werewolf" || player.role === "wolf_cat",
			)
			.map((player) => player.id);

		for (const player of this.players.values()) {
			const teamText =
				ROLE_INFO[player.role].team === "village"
					? "村人陣営"
					: ROLE_INFO[player.role].team === "werewolf"
						? "人狼陣営"
						: ROLE_INFO[player.role].team === "fox"
							? "きつね陣営"
							: ROLE_INFO[player.role].team === "freaks"
								? "フリークス陣営"
								: "てるてる陣営";

			const lines = [
				`あなたの役職は **${ROLE_INFO[player.role].name}** です。`,
				`陣営: **${teamText}**`,
				`説明: ${ROLE_INFO[player.role].description}`,
			];

			if (player.role === "werewolf" || player.role === "wolf_cat") {
				const teammateIds = werewolves.filter((id) => id !== player.id);
				const representative = werewolves.length > 1 ? werewolves[0] : null;
				if (teammateIds.length > 0) {
					lines.push("仲間:");
					for (const teammateId of teammateIds) {
						lines.push(`- ${this.nameOf(teammateId)} (<@${teammateId}>)`);
					}
				}
				if (representative) {
					lines.push(
						`この役職の夜アクション代表: <@${representative}> (${this.nameOf(representative)})`,
					);
				}
			} else if (player.role === "teruteru") {
				lines.push("仲間:");
				lines.push("- 処刑されると即勝利です。");
			} else if (player.role === "freaks") {
				const affiliation = this.freaksAffiliations.get(player.id) ?? "third";
				const teamLabel =
					affiliation === "village"
						? "村人陣営"
						: affiliation === "werewolf"
							? "人狼陣営"
							: "第三陣営";
				lines.push(`現在の所属陣営: **${teamLabel}**`);
			}

			try {
				const user = await this.client.users.fetch(player.id);
				await user.send({
					content: lines.join("\n"),
				});
			} catch {
				await this.postSourceMessage(
					`<@${player.id}> にDMが送れませんでした。DMを受け取れる設定にしてください。`,
				);
			}
		}

		void guild;
	}

	async setMainTalkPermission(daytime: boolean) {
		if (!this.mainChannelId) return;
		const guild = await this.fetchGuild();
		const channel = guild.channels.cache.get(this.mainChannelId);
		if (!channel || channel.type !== ChannelType.GuildText) return;

		for (const participantId of this.participants) {
			const player = this.players.get(participantId);
			const isAlive = Boolean(player?.alive);
			const canSpeak = daytime && isAlive;
			await channel.permissionOverwrites.edit(participantId, {
				ViewChannel: true,
				SendMessages: canSpeak,
				SendMessagesInThreads: canSpeak,
				CreatePublicThreads: canSpeak,
				CreatePrivateThreads: canSpeak,
				AddReactions: isAlive,
				UseApplicationCommands: isAlive,
			});
		}
	}

	async startGame(trigger: ButtonInteraction) {
		if (this.phase !== "recruiting") {
			await trigger.reply({
				content: "このゲームはすでに開始済みです。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const guild = trigger.guild;
		if (!guild) {
			await trigger.reply({
				content: "サーバー情報を取得できませんでした。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const botMember = guild.members.me ?? (await guild.members.fetchMe());
		if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
			await trigger.reply({
				content:
					"チャンネル作成に必要な `ManageChannels` 権限がBotにありません。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (this.participantCount() < MIN_PLAYERS) {
			await trigger.reply({
				content: `開始には最低${MIN_PLAYERS}人必要です。`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (
			!resolveRoleConfig(this.participantCount(), this.settings.roleOverrides)
		) {
			const resolved = roleConfigForPlayerCount(this.participantCount());
			for (const [role, override] of Object.entries(
				this.settings.roleOverrides,
			)) {
				if (typeof override !== "number") continue;
				resolved[role as Role] = override;
			}
			resolved.villager =
				this.participantCount() -
				(Object.entries(resolved)
					.filter(([role]) => role !== "villager")
					.reduce((sum, [, value]) => sum + Number(value), 0) || 0);
			const reason =
				validateResolvedRoleConfig(this.participantCount(), resolved) ??
				"現在の役職設定では参加人数を超えています。役職数を見直してから開始してください。";
			await trigger.reply({
				content: reason,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await trigger.deferUpdate();
		this.bumpActivity();
		this.phase = "night";

		await this.assignRolesAndCacheNames(guild);
		await this.setupGameChannels(guild);
		await this.disableRecruitButtons();
		await this.dmRoleNotifications(guild);

		const main = await this.getMainChannel();
		if (main) {
			await main.send({
				content:
					"ゲーム開始。夜はメインチャンネルで会話できません。DMを確認してください。",
			});
		}

		await this.postStartControlMessage();

		void this.runLoop();
	}

	async getMainChannel() {
		if (!this.mainChannelId) return null;
		const guild = await this.fetchGuild();
		const channel = guild.channels.cache.get(this.mainChannelId);
		if (!channel || channel.type !== ChannelType.GuildText) return null;
		return channel;
	}

	resolveRoleRepresentative(role: Role) {
		const alive =
			role === "werewolf"
				? this.alivePlayers().filter(
						(player) =>
							player.role === "werewolf" || player.role === "wolf_cat",
					)
				: this.aliveByRole(role);
		if (alive.length === 0) return null;
		const rep = alive[0]?.id ?? null;
		if (rep) this.nightRepresentatives.set(role, rep);
		return rep;
	}

	buildTargetButtons(
		prefix: string,
		targets: PlayerState[],
		labelPrefix: string,
	) {
		const rows = chunk(targets, 5).map((group) => {
			const row = new ActionRowBuilder<ButtonBuilder>();
			for (const target of group) {
				row.addComponents(
					new ButtonBuilder()
						.setCustomId(`${prefix}:${target.id}`)
						.setLabel(`${labelPrefix}${this.nameOf(target.id).slice(0, 30)}`)
						.setStyle(ButtonStyle.Secondary),
				);
			}
			return row;
		});
		return rows;
	}

	buildFreaksAffiliationButtons() {
		const teams: FreaksAffiliation[] = ["village", "werewolf", "third"];
		const labels: Record<FreaksAffiliation, string> = {
			village: "村人陣営",
			werewolf: "人狼陣営",
			third: "第三陣営",
		};

		return [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				...teams.map((team) =>
					new ButtonBuilder()
						.setCustomId(`wolf:act:${this.gameId}:freaks:${team}`)
						.setLabel(labels[team])
						.setStyle(ButtonStyle.Secondary),
				),
			),
		];
	}

	buildVoteButtons(targets: PlayerState[]) {
		const rows = this.buildTargetButtons(
			`wolf:vote:${this.gameId}`,
			targets,
			"投票:",
		);
		const skipRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`wolf:vote:${this.gameId}:skip`)
				.setLabel("投票スキップ")
				.setStyle(ButtonStyle.Secondary),
		);
		rows.push(skipRow);
		return rows;
	}

	buildDiscussionSkipComponents(disabled = false) {
		const total = this.alivePlayerIds().length;
		const skipped = this.discussionSkippers.size;

		return [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`wolf:discussion_skip:${this.gameId}`)
					.setLabel(`議論スキップ (${skipped}/${total})`)
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(disabled),
			),
		];
	}

	buildVoteProgressContent() {
		const total = this.alivePlayerIds().length;
		const voted = total - this.pendingVoters.size;
		const pendingMentions = [...this.pendingVoters].map((id) => `<@${id}>`);

		return [
			`投票状況: **${voted}/${total}**`,
			`未投票者(${this.pendingVoters.size}): ${
				pendingMentions.length > 0 ? pendingMentions.join(", ") : "なし"
			}`,
		].join("\n");
	}

	async postOrUpdateVoteProgress() {
		const main = await this.getMainChannel();
		if (!main) return;

		const content = this.buildVoteProgressContent();
		if (!this.voteProgressMessageId) {
			const message = await main.send({ content });
			this.voteProgressMessageId = message.id;
			return;
		}

		try {
			const message = await main.messages.fetch(this.voteProgressMessageId);
			await message.edit({ content });
		} catch {
			const message = await main.send({ content });
			this.voteProgressMessageId = message.id;
		}
	}

	async postDiscussionSkipControl() {
		const main = await this.getMainChannel();
		if (!main) return;
		const message = await main.send({
			content:
				"議論を早めに終えたい場合は、全員が `議論スキップ` を押してください。",
			components: this.buildDiscussionSkipComponents(),
		});
		this.discussionControlMessageId = message.id;
	}

	async updateDiscussionSkipControl() {
		if (!this.discussionControlMessageId) return;
		const main = await this.getMainChannel();
		if (!main) return;
		try {
			const message = await main.messages.fetch(
				this.discussionControlMessageId,
			);
			await message.edit({ components: this.buildDiscussionSkipComponents() });
		} catch {
			// ignore
		}
	}

	async disableMessageButtons(messageId: string | null) {
		if (!messageId) return;
		const main = await this.getMainChannel();
		if (!main) return;

		try {
			const message = await main.messages.fetch(messageId);
			const disabledRows = message.components.flatMap((row) => {
				if (row.type !== ComponentType.ActionRow) return [];
				const nextRow = new ActionRowBuilder<ButtonBuilder>();
				for (const component of row.components) {
					if (component.type !== ComponentType.Button) continue;
					nextRow.addComponents(
						ButtonBuilder.from(component).setDisabled(true),
					);
				}
				if (nextRow.components.length === 0) return [];
				return [nextRow];
			});

			if (disabledRows.length === 0) return;
			await message.edit({ components: disabledRows });
		} catch {
			// ignore
		}
	}

	requiredNightRoles() {
		const required: Role[] = [];
		const alive = this.alivePlayers();
		if (
			alive.some((p) => p.role === "werewolf" || p.role === "wolf_cat") &&
			alive.some((p) => p.role !== "werewolf" && p.role !== "wolf_cat")
		) {
			required.push("werewolf");
		}
		if (alive.some((p) => p.role === "seer")) required.push("seer");
		if (alive.some((p) => p.role === "knight")) required.push("knight");
		if (
			alive.some((p) => p.role === "medium") &&
			this.deadUninspectedPlayers().length > 0
		) {
			required.push("medium");
		}
		if (alive.some((p) => p.role === "freaks")) required.push("freaks");
		return required;
	}

	async runNight() {
		this.phase = "night";
		this.nightActions = {};
		this.pendingNightRoles.clear();
		this.nightRepresentatives.clear();
		this.bumpActivity();
		await this.setMainTalkPermission(false);

		const main = await this.getMainChannel();
		if (main) {
			await main.send({
				content: `🌙 **${this.round + 1}日目の夜** が始まりました。必要な役職には夜アクションDMを送ります。`,
			});
		}

		if (this.round === 0) {
			const hasAliveFreaks = this.alivePlayers().some(
				(player) => player.role === "freaks",
			);
			if (hasAliveFreaks) {
				const rep = this.resolveRoleRepresentative("freaks");
				if (rep) {
					this.pendingNightRoles.add("freaks");
					try {
						const user = await this.client.users.fetch(rep);
						await user.send({
							content:
								"初日夜のフリークス陣営選択です。今夜の所属陣営を選択してください。",
							components: this.buildFreaksAffiliationButtons(),
						});
					} catch {
						this.pendingNightRoles.delete("freaks");
						await this.postSourceMessage(
							`<@${rep}> にフリークスの夜アクションDMを送れなかったため、初日夜の陣営選択をスキップしました。`,
						);
					}
				}
			}

			if (this.pendingNightRoles.size > 0) {
				await new Promise<void>((resolve) => {
					this.nightResolver = resolve;
					this.phaseTimer = setTimeout(() => {
						this.resolveNightByTimeout();
						resolve();
					}, NIGHT_ACTION_MS);
					this.phaseTimer.unref?.();
				});
			}
			this.nightResolver = null;
			if (this.phaseTimer) {
				clearTimeout(this.phaseTimer);
				this.phaseTimer = null;
			}

			await this.resolveNightOutcome();
			if (main) {
				await main.send({
					content:
						"初日の夜は襲撃なしで朝へ進みます。",
				});
			}
			return;
		}

		const required = this.requiredNightRoles();
		for (const role of required) {
			this.pendingNightRoles.add(role);
		}

		for (const role of required) {
			const rep = this.resolveRoleRepresentative(role);
			if (!rep) {
				this.pendingNightRoles.delete(role);
				continue;
			}

			let rows: ActionRowBuilder<ButtonBuilder>[] = [];
			if (role === "freaks") {
				rows = this.buildFreaksAffiliationButtons();
			} else {
				let targets =
					role === "medium"
						? this.deadUninspectedPlayers()
						: this.alivePlayers();
				if (role === "werewolf") {
					targets = targets.filter(
						(p) => p.role !== "werewolf" && p.role !== "wolf_cat",
					);
				}
				if (role === "seer") {
					targets = targets.filter((p) => p.id !== rep);
				}
				if (role === "knight") {
					targets = targets.filter((p) => p.id !== rep);
				}

				if (targets.length === 0) {
					this.pendingNightRoles.delete(role);
					continue;
				}

				rows = this.buildTargetButtons(
					`wolf:act:${this.gameId}:${role}`,
					targets,
					"",
				);
			}

			const aliveMembers =
				role === "werewolf"
					? this.alivePlayers().filter(
							(player) =>
								player.role === "werewolf" || player.role === "wolf_cat",
						)
					: this.aliveByRole(role);
			const multiNotice =
				aliveMembers.length > 1 ? `\nこの役職の代表者: <@${rep}>` : "";
			try {
				const user = await this.client.users.fetch(rep);
				await user.send(
					role === "freaks"
						? {
								content:
									"フリークスの夜アクションです。今夜の所属陣営を選択してください。",
								components: rows,
							}
						: {
								content: `${ROLE_INFO[role].name}の夜アクションです。対象を選択してください。${multiNotice}`,
								components: rows,
							},
				);
			} catch {
				this.pendingNightRoles.delete(role);
				await this.postSourceMessage(
					`<@${rep}> に夜アクションDMを送れなかったため、${ROLE_INFO[role].name}のアクションをスキップしました。`,
				);
			}
		}

		if (this.pendingNightRoles.size > 0) {
			await new Promise<void>((resolve) => {
				this.nightResolver = resolve;
				this.phaseTimer = setTimeout(() => {
					this.resolveNightByTimeout();
					resolve();
				}, NIGHT_ACTION_MS);
				this.phaseTimer.unref?.();
			});
		}

		this.nightResolver = null;
		if (this.phaseTimer) {
			clearTimeout(this.phaseTimer);
			this.phaseTimer = null;
		}

		await this.resolveNightOutcome();
	}

	resolveNightByTimeout() {
		for (const role of [...this.pendingNightRoles]) {
			const rep = this.nightRepresentatives.get(role);
			if (!rep) continue;

			let targets =
				role === "medium" ? this.deadUninspectedPlayers() : this.alivePlayers();
			if (role === "werewolf")
				targets = targets.filter(
					(p) => p.role !== "werewolf" && p.role !== "wolf_cat",
				);
			if (role === "seer") targets = targets.filter((p) => p.id !== rep);
			if (role === "knight") targets = targets.filter((p) => p.id !== rep);
			if (role === "freaks") {
				const teams: FreaksAffiliation[] = ["village", "werewolf", "third"];
				const selected = pickRandom(teams);
				if (!selected) continue;
				this.nightActions.freaks = selected;
				this.pendingNightRoles.delete(role);
				this.freaksAffiliations.set(rep, selected);
				continue;
			}

			const selected = pickRandom(targets);
			if (!selected) continue;

			if (role === "werewolf") this.nightActions.werewolf = selected.id;
			if (role === "seer") this.nightActions.seer = selected.id;
			if (role === "knight") this.nightActions.knight = selected.id;
			if (role === "medium") this.nightActions.medium = selected.id;

			this.pendingNightRoles.delete(role);
		}
	}

	async resolveNightOutcome() {
		const deadIds = new Set<string>();
		const main = await this.getMainChannel();
		const wolfTargetId = this.nightActions.werewolf;
		const guardTargetId = this.nightActions.knight;
		const seerTargetId = this.nightActions.seer;
		const mediumTargetId = this.nightActions.medium;
		const freaksTeam = this.nightActions.freaks;
		const knightActorId = this.nightRepresentatives.get("knight");

		if (seerTargetId) {
			const seerTarget = this.players.get(seerTargetId);
			const aliveSeers = this.aliveByRole("seer");
			if (seerTarget) {
				for (const seer of aliveSeers) {
					try {
						const user = await this.client.users.fetch(seer.id);
						await user.send({
							content: `占い結果: **${this.nameOf(seerTarget.id)}** は ${
								seerTarget.role === "werewolf" || seerTarget.role === "wolf_cat"
									? "人狼"
									: "人狼ではありません"
							}。`,
						});
					} catch {
						// ignore
					}
				}

				if (seerTarget.role === "fox" && seerTarget.alive) {
					deadIds.add(seerTarget.id);
					if (main) {
						await main.send({
							content: `🦊 ${this.nameOf(seerTarget.id)} が呪殺されました。`,
						});
					}
				}
			}
		}

		if (mediumTargetId) {
			const mediumTarget = this.players.get(mediumTargetId);
			const aliveMediums = this.aliveByRole("medium");
			if (mediumTarget && !mediumTarget.alive) {
				this.mediumInspected.add(mediumTarget.id);
				for (const medium of aliveMediums) {
					try {
						const user = await this.client.users.fetch(medium.id);
						await user.send({
							content: `霊媒結果: ${this.nameOf(mediumTarget.id)} は ${
								mediumTarget.role === "werewolf" ||
								mediumTarget.role === "wolf_cat"
									? "人狼"
									: "人狼ではありません"
							}。`,
						});
					} catch {
						// ignore
					}
				}
			}
		}

		if (freaksTeam) {
			const freaksRep = this.nightRepresentatives.get("freaks");
			if (freaksRep) {
				this.freaksAffiliations.set(freaksRep, freaksTeam);
			}
		}

		if (guardTargetId && knightActorId) {
			const guardTarget = this.players.get(guardTargetId);
			const knightActor = this.players.get(knightActorId);
			if (
				guardTarget?.alive &&
				knightActor?.alive &&
				(guardTarget.role === "werewolf" || guardTarget.role === "wolf_cat")
			) {
				deadIds.add(knightActorId);
				if (main) {
					await main.send({
						content: `🩸 ${this.nameOf(knightActorId)} は人狼を護衛したため死亡しました。`,
					});
				}
			}
		}

		if (wolfTargetId) {
			const wolfTarget = this.players.get(wolfTargetId);
			if (wolfTarget?.alive) {
				if (wolfTarget.role === "fox") {
					if (main) {
						await main.send({
							content: "🦊 人狼の襲撃は失敗しました。",
						});
					}
				} else if (guardTargetId && guardTargetId === wolfTargetId) {
					if (main) {
						await main.send({
							content: `🛡️ ${this.nameOf(wolfTargetId)} は騎士に護衛されました。`,
						});
					}
				} else {
					deadIds.add(wolfTargetId);
				}
			}
		}

		for (const deadId of deadIds) {
			const player = this.players.get(deadId);
			if (player) player.alive = false;
		}

		if (main) {
			if (deadIds.size === 0) {
				await main.send({
					content: "☀️ 朝になりました。昨夜の死者はいません。",
				});
			} else {
				const names = [...deadIds].map(
					(id) => `- ${this.nameOf(id)} (<@${id}>)`,
				);
				await main.send({
					content: `☀️ 朝になりました。昨夜の死者:\n${names.join("\n")}`,
				});
			}
		}
	}

	async runDay() {
		this.bumpActivity();

		await this.setMainTalkPermission(true);
		const main = await this.getMainChannel();
		if (!main) return;

		this.phase = "discussion";
		this.discussionSkippers.clear();
		this.discussionControlMessageId = null;

		await main.send({
			content: `🗣️ 議論時間は${formatDurationMinutes(this.settings.discussionMs)}です。終了後に投票時間へ移ります。`,
		});
		await this.postDiscussionSkipControl();

		let remainingMinutes = Math.floor(this.settings.discussionMs / 60_000);
		const discussionTicker = setInterval(() => {
			remainingMinutes -= 1;
			if (this.phase !== "discussion" || remainingMinutes <= 0) return;
			void this.getMainChannel().then((channel) => {
				if (!channel) return;
				return channel.send({
					content: `⏳ 議論残り${remainingMinutes}分`,
				});
			});
		}, 60_000);
		discussionTicker.unref?.();

		await new Promise<void>((resolve) => {
			this.discussionResolver = resolve;
			this.phaseTimer = setTimeout(resolve, this.settings.discussionMs);
			this.phaseTimer?.unref?.();
		});
		this.discussionResolver = null;
		clearInterval(discussionTicker);

		if (this.phaseTimer) {
			clearTimeout(this.phaseTimer);
			this.phaseTimer = null;
		}
		await this.disableMessageButtons(this.discussionControlMessageId);

		await this.setMainTalkPermission(false);

		this.phase = "vote";
		this.votes.clear();
		this.pendingVoters = new Set(this.alivePlayerIds());
		this.voteActionMessageId = null;
		this.voteProgressMessageId = null;

		const alive = this.alivePlayers();
		const voteRows = this.buildVoteButtons(alive);

		const voteMessage = await main.send({
			content: `🗳️ 投票時間は${formatDurationMinutes(this.settings.voteMs)}です。未投票者は無効票扱いになります。`,
			components: voteRows,
		});
		this.voteActionMessageId = voteMessage.id;
		await this.postOrUpdateVoteProgress();

		if (this.pendingVoters.size > 0) {
			await new Promise<void>((resolve) => {
				this.dayResolver = resolve;
				this.phaseTimer = setTimeout(() => {
					resolve();
				}, this.settings.voteMs);
				this.phaseTimer.unref?.();
			});
		}

		this.dayResolver = null;
		if (this.phaseTimer) {
			clearTimeout(this.phaseTimer);
			this.phaseTimer = null;
		}
		await this.disableMessageButtons(this.voteActionMessageId);

		await this.setMainTalkPermission(false);
		await this.resolveDayOutcome();
		this.round += 1;
	}

	async resolveDayOutcome() {
		const main = await this.getMainChannel();
		if (!main) return;

		if (this.pendingVoters.size > 0) {
			await main.send({
				content: `未投票: ${this.pendingVoters.size}人。未投票者は今回の集計に含まれません。`,
			});
		}

		const tally = new Map<string, number>();
		for (const targetId of this.votes.values()) {
			tally.set(targetId, (tally.get(targetId) ?? 0) + 1);
		}

		if (tally.size === 0) {
			await main.send({
				content: "投票が成立しませんでした。処刑なしで夜に移ります。",
			});
			return;
		}

		const maxVotes = Math.max(...tally.values());
		const candidates = [...tally.entries()]
			.filter(([, vote]) => vote === maxVotes)
			.map(([id]) => id);
		const executedId = pickRandom(candidates);
		if (!executedId) return;

		if (executedId === "skip") {
			await main.send({
				content: "⚖️ 投票の結果、今回は処刑をスキップしました。",
			});
			return;
		}

		const executedPlayer = this.players.get(executedId);
		if (!executedPlayer) return;

		executedPlayer.alive = false;
		await main.send({
			content: `⚖️ 投票の結果、**${this.nameOf(executedId)}** (<@${executedId}>) が処刑されました。`,
		});

		if (executedPlayer.role === "wolf_cat") {
			const candidates = this.alivePlayers().filter(
				(player) => ROLE_INFO[player.role].team === "village",
			);
			const chosen = pickRandom(candidates);
			if (chosen) {
				chosen.alive = false;
				await main.send({
					content: `🐾 猫又の道連れで **${this.nameOf(chosen.id)}** (<@${chosen.id}>) が死亡しました。`,
				});
			} else {
				await main.send({
					content: "🐾 猫又の道連れ対象がいなかったため、追加の死亡者は出ませんでした。",
				});
			}
		}

		if (executedPlayer.role === "nice_cat") {
			const candidates = this.alivePlayers();
			const chosen = pickRandom(candidates);
			if (chosen) {
				chosen.alive = false;
				await main.send({
					content: `🐾 ナイス猫又の道連れで **${this.nameOf(chosen.id)}** (<@${chosen.id}>) が死亡しました。`,
				});
			} else {
				await main.send({
					content:
						"🐾 ナイス猫又の道連れ対象がいなかったため、追加の死亡者は出ませんでした。",
				});
			}
		}

		if (executedPlayer.role === "teruteru") {
			this.teruteruWinnerId = executedId;
			this.forcedWinReason = "てるてる陣営の勝利";
			await main.send({
				content: `☀️ **${this.nameOf(executedId)}** の役職は てるてる でした。処刑されたため即勝利です。`,
			});
			return;
		}
	}

	checkWinCondition() {
		if (this.forcedWinReason) {
			return this.forcedWinReason;
		}

		const alive = this.alivePlayers();
		const wolves = alive.filter(
			(player) => this.effectiveTeamOf(player) === "werewolf",
		).length;
		const foxes = alive.filter(
			(player) => this.effectiveTeamOf(player) === "fox",
		).length;
		const nonWolves = alive.length - wolves;
		const villageWinState = wolves === 0;
		const werewolfWinState = wolves >= nonWolves;

		if (foxes > 0 && (villageWinState || werewolfWinState)) {
			return "きつね陣営の勝利";
		}

		if (villageWinState) {
			return "村人陣営の勝利";
		}

		if (werewolfWinState) {
			return "人狼陣営の勝利";
		}

		return null;
	}

	resolveWinnerIdsFromReason(reason: string) {
		if (reason.includes("村人陣営の勝利")) {
			return this.alivePlayers()
				.filter((player) => this.effectiveTeamOf(player) === "village")
				.map((player) => player.id);
		}
		if (reason.includes("人狼陣営の勝利")) {
			return this.alivePlayers()
				.filter((player) => this.effectiveTeamOf(player) === "werewolf")
				.map((player) => player.id);
		}
		if (reason.includes("きつね陣営の勝利")) {
			return this.alivePlayers()
				.filter((player) => {
					if (this.effectiveTeamOf(player) === "fox") return true;
					if (player.role !== "freaks") return false;
					return (this.freaksAffiliations.get(player.id) ?? "third") === "third";
				})
				.map((player) => player.id);
		}
		if (reason.includes("フリークス陣営の勝利")) {
			return this.alivePlayers()
				.filter((player) => this.effectiveTeamOf(player) === "freaks")
				.map((player) => player.id);
		}
		if (reason.includes("てるてる陣営の勝利")) {
			const winners = new Set<string>();
			if (this.teruteruWinnerId) {
				winners.add(this.teruteruWinnerId);
			}
			for (const player of this.alivePlayers()) {
				if (player.role !== "freaks") continue;
				if ((this.freaksAffiliations.get(player.id) ?? "third") === "third") {
					winners.add(player.id);
				}
			}
			return [...winners];
		}
		return [];
	}

	async runLoop() {
		try {
			while (!this.closed) {
				const initialWin = this.checkWinCondition();
				if (initialWin) {
					await this.endGame(`${initialWin}です。`);
					break;
				}

				await this.runNight();
				if (this.closed) break;

				const afterNightWin = this.checkWinCondition();
				if (afterNightWin) {
					await this.endGame(`${afterNightWin}です。`);
					break;
				}

				await this.runDay();
				if (this.closed) break;

				const afterDayWin = this.checkWinCondition();
				if (afterDayWin) {
					await this.endGame(`${afterDayWin}です。`);
					break;
				}
			}
		} catch (error) {
			console.error("wolfgame loop error:", error);
			await this.endGame("エラーのためゲームを終了しました。");
		}
	}

	async deleteCreatedChannels() {
		if (!this.mainChannelId) return;
		const guild = await this.fetchGuild().catch(() => null);
		if (!guild) return;
		const channel = guild.channels.cache.get(this.mainChannelId);
		if (!channel) return;
		try {
			await channel.delete("wolfgame終了");
		} catch {
			// ignore
		}
	}

	async endGame(reason: string) {
		if (this.closed) return;
		this.closed = true;
		this.phase = "ended";
		this.clearTimers();

		if (this.nightResolver) this.nightResolver();
		if (this.discussionResolver) this.discussionResolver();
		if (this.dayResolver) this.dayResolver();

		await this.disableRecruitButtons();
		await this.disableMessageButtons(this.discussionControlMessageId);
		await this.disableMessageButtons(this.voteActionMessageId);

		const main = await this.getMainChannel();
		const winnerIds = this.resolveWinnerIdsFromReason(reason);
		const winnerMessage =
			winnerIds.length > 0
				? `勝者: ${winnerIds.map((id) => `<@${id}>`).join(" ")}`
				: null;
		if (main) {
			await main.send({
				content: `🏁 ゲーム終了: ${reason}\n会話チャンネルは10秒後に削除されます。`,
			});
			await this.postSourceMessage(`人狼ゲーム終了: ${reason}`);
			if (winnerMessage) {
				await this.postSourceMessage(winnerMessage);
			}
			await sleep(10_000);
			await this.deleteCreatedChannels();
		} else {
			await this.postSourceMessage(`人狼ゲーム終了: ${reason}`);
			if (winnerMessage) {
				await this.postSourceMessage(winnerMessage);
			}
		}

		sessionsByGuild.delete(this.guildId);
		sessionsByGameId.delete(this.gameId);
	}
}
