import type {
	ButtonInteraction,
	ChatInputCommandInteraction,
	Client,
	Guild,
} from "discord.js";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";

type Role =
	| "villager"
	| "werewolf"
	| "seer"
	| "knight"
	| "medium"
	| "fox"
	| "madman";

type Phase = "recruiting" | "night" | "day" | "ended";

type Team = "village" | "werewolf" | "fox";

interface RoleInfo {
	name: string;
	team: Team;
	hasNightAction: boolean;
}

interface PlayerState {
	id: string;
	role: Role;
	alive: boolean;
}

interface NightActions {
	werewolf?: string;
	seer?: string;
	knight?: string;
}

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 15;
const DISCUSSION_MS = 5 * 60 * 1000;
const NIGHT_ACTION_MS = 5 * 60 * 1000;
const INACTIVITY_MS = 15 * 60 * 1000;

const ROLE_INFO: Record<Role, RoleInfo> = {
	villager: { name: "村人", team: "village", hasNightAction: false },
	werewolf: { name: "人狼", team: "werewolf", hasNightAction: true },
	seer: { name: "占い師", team: "village", hasNightAction: true },
	knight: { name: "騎士", team: "village", hasNightAction: true },
	medium: { name: "霊媒師", team: "village", hasNightAction: false },
	fox: { name: "きつね", team: "fox", hasNightAction: false },
	madman: { name: "狂人", team: "werewolf", hasNightAction: false },
};

const ROLE_ORDER: Role[] = [
	"werewolf",
	"madman",
	"seer",
	"knight",
	"medium",
	"fox",
	"villager",
];

const sessionsByGuild = new Map<string, WolfGameSession>();
const sessionsByGameId = new Map<string, WolfGameSession>();

const shuffle = <T>(values: T[]) => {
	const cloned = [...values];
	for (let i = cloned.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[cloned[i], cloned[j]] = [cloned[j], cloned[i]];
	}
	return cloned;
};

const pickRandom = <T>(values: T[]): T | undefined => {
	if (values.length === 0) return undefined;
	return values[Math.floor(Math.random() * values.length)];
};

const chunk = <T>(values: T[], size: number): T[][] => {
	const results: T[][] = [];
	for (let i = 0; i < values.length; i += size) {
		results.push(values.slice(i, i + size));
	}
	return results;
};

const roleConfigForPlayerCount = (count: number): Record<Role, number> => {
	const werewolf = count >= 12 ? 3 : count >= 9 ? 2 : 1;
	const madman = count >= 11 ? 2 : 1;
	const seer = 1;
	const knight = count >= 15 ? 2 : 1;
	const medium = count >= 6 ? 1 : 0;
	const fox = count >= 14 ? 2 : count >= 8 ? 1 : 0;

	const occupied = werewolf + madman + seer + knight + medium + fox;
	const villager = Math.max(0, count - occupied);

	return {
		villager,
		werewolf,
		seer,
		knight,
		medium,
		fox,
		madman,
	};
};

const roleArrayFromConfig = (config: Record<Role, number>): Role[] => {
	const roles: Role[] = [];
	for (const role of ROLE_ORDER) {
		for (let i = 0; i < config[role]; i += 1) {
			roles.push(role);
		}
	}
	return roles;
};

const formatRoleConfig = (config: Record<Role, number>) => {
	return ROLE_ORDER.filter((role) => config[role] > 0)
		.map((role) => `${ROLE_INFO[role].name} x${config[role]}`)
		.join(" / ");
};

const makeId = () =>
	`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const sleep = (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});

class WolfGameSession {
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
	dayResolver: (() => void) | null = null;

	nightActions: NightActions = {};
	pendingNightRoles = new Set<Role>();
	nightRepresentatives = new Map<Role, string>();
	votes = new Map<string, string>();
	pendingVoters = new Set<string>();

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
		const config = roleConfigForPlayerCount(previewCount);
		const participantText = [...this.participants]
			.map((id) => `<@${id}>`)
			.join("\n");

		return new EmbedBuilder()
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
				value: formatRoleConfig(config),
			})
			.setFooter({ text: "5〜15人でプレイできます" })
			.setTimestamp();
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

	alivePlayers() {
		return [...this.players.values()].filter((p) => p.alive);
	}

	alivePlayerIds() {
		return this.alivePlayers().map((p) => p.id);
	}

	aliveByRole(role: Role) {
		return this.alivePlayers().filter((p) => p.role === role);
	}

	isParticipant(userId: string) {
		return this.participants.has(userId);
	}

	participantCount() {
		return this.participants.size;
	}

	async assignRolesAndCacheNames(guild: Guild) {
		const ids = shuffle([...this.participants]);
		const roleConfig = roleConfigForPlayerCount(ids.length);
		const roles = shuffle(roleArrayFromConfig(roleConfig));

		ids.forEach((id, index) => {
			const role = roles[index] as Role | undefined;
			if (!role) return;
			this.players.set(id, { id, role, alive: true });
		});

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
		const roleGroups = new Map<Role, string[]>();
		for (const role of ROLE_ORDER) roleGroups.set(role, []);

		for (const player of this.players.values()) {
			const group = roleGroups.get(player.role);
			if (group) group.push(player.id);
		}

		for (const player of this.players.values()) {
			const sameRole = roleGroups.get(player.role) ?? [];
			const teammateIds = sameRole.filter((id) => id !== player.id);
			const representative = sameRole.length > 1 ? sameRole[0] : null;
			const teamText =
				ROLE_INFO[player.role].team === "village"
					? "村人陣営"
					: ROLE_INFO[player.role].team === "werewolf"
						? "人狼陣営"
						: "きつね陣営";

			const lines = [
				`あなたの役職は **${ROLE_INFO[player.role].name}** です。`,
				`陣営: **${teamText}**`,
			];

			if (teammateIds.length > 0) {
				lines.push("仲間:");
				for (const teammateId of teammateIds) {
					lines.push(`- ${this.nameOf(teammateId)} (<@${teammateId}>)`);
				}
				if (representative) {
					lines.push(
						`この役職の夜アクション代表: <@${representative}> (${this.nameOf(representative)})`,
					);
				}
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

		await this.postSourceMessage(
			`人狼ゲームを開始しました。進行チャンネル: <#${this.mainChannelId}>`,
		);

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
		const alive = this.aliveByRole(role);
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

	requiredNightRoles() {
		const required: Role[] = [];
		const alive = this.alivePlayers();
		if (
			alive.some((p) => p.role === "werewolf") &&
			alive.some((p) => p.role !== "werewolf")
		) {
			required.push("werewolf");
		}
		if (alive.some((p) => p.role === "seer")) required.push("seer");
		if (alive.some((p) => p.role === "knight")) required.push("knight");
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
			if (main) {
				await main.send({
					content:
						"初日の夜は役職配布のみです。夜アクションはありません。すぐに朝へ進みます。",
				});
				await main.send({
					content: "☀️ 朝になりました。初日は犠牲者なしで議論を開始します。",
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

			let targets = this.alivePlayers();
			if (role === "werewolf") {
				targets = targets.filter((p) => p.role !== "werewolf");
			}
			if (role === "seer") {
				targets = targets.filter((p) => p.id !== rep);
			}

			if (targets.length === 0) {
				this.pendingNightRoles.delete(role);
				continue;
			}

			const rows = this.buildTargetButtons(
				`wolf:act:${this.gameId}:${role}`,
				targets,
				"",
			);

			const aliveMembers = this.aliveByRole(role);
			const multiNotice =
				aliveMembers.length > 1 ? `\nこの役職の代表者: <@${rep}>` : "";
			try {
				const user = await this.client.users.fetch(rep);
				await user.send({
					content: `${ROLE_INFO[role].name}の夜アクションです。対象を選択してください。${multiNotice}`,
					components: rows,
				});
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

			let targets = this.alivePlayers();
			if (role === "werewolf")
				targets = targets.filter((p) => p.role !== "werewolf");
			if (role === "seer") targets = targets.filter((p) => p.id !== rep);

			const selected = pickRandom(targets);
			if (!selected) continue;

			if (role === "werewolf") this.nightActions.werewolf = selected.id;
			if (role === "seer") this.nightActions.seer = selected.id;
			if (role === "knight") this.nightActions.knight = selected.id;

			this.pendingNightRoles.delete(role);
		}
	}

	async resolveNightOutcome() {
		const deadIds = new Set<string>();
		const main = await this.getMainChannel();
		const wolfTargetId = this.nightActions.werewolf;
		const guardTargetId = this.nightActions.knight;
		const seerTargetId = this.nightActions.seer;

		if (seerTargetId) {
			const seerTarget = this.players.get(seerTargetId);
			const aliveSeers = this.aliveByRole("seer");
			if (seerTarget) {
				for (const seer of aliveSeers) {
					try {
						const user = await this.client.users.fetch(seer.id);
						await user.send({
							content: `占い結果: **${this.nameOf(seerTarget.id)}** は ${seerTarget.role === "werewolf" ? "人狼" : "人狼ではありません"}。`,
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
		this.phase = "day";
		this.votes.clear();
		this.pendingVoters = new Set(this.alivePlayerIds());
		this.bumpActivity();

		await this.setMainTalkPermission(true);
		const main = await this.getMainChannel();
		if (!main) return;

		const alive = this.alivePlayers();
		const voteRows = this.buildVoteButtons(alive);

		await main.send({
			content:
				"🗣️ 議論時間は5分です。全員の投票が揃ったら即終了します。時間切れの場合は未投票者にランダム投票を割り当てます。",
		});

		await main.send({
			content:
				"処刑投票を行ってください。処刑したくない場合は `投票スキップ` を選んでください。",
			components: voteRows,
		});

		if (this.pendingVoters.size > 0) {
			await new Promise<void>((resolve) => {
				this.dayResolver = resolve;
				this.phaseTimer = setTimeout(() => {
					this.resolveDayByTimeout();
					resolve();
				}, DISCUSSION_MS);
				this.phaseTimer.unref?.();
			});
		}

		this.dayResolver = null;
		if (this.phaseTimer) {
			clearTimeout(this.phaseTimer);
			this.phaseTimer = null;
		}

		await this.setMainTalkPermission(false);
		await this.resolveDayOutcome();
		this.round += 1;
	}

	resolveDayByTimeout() {
		for (const voterId of [...this.pendingVoters]) {
			const targets = this.alivePlayers()
				.filter((p) => p.id !== voterId)
				.map((p) => p.id);
			const selected = pickRandom(targets);
			if (!selected) continue;
			this.votes.set(voterId, selected);
			this.pendingVoters.delete(voterId);
		}
	}

	async resolveDayOutcome() {
		const main = await this.getMainChannel();
		if (!main) return;

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

		const mediums = this.aliveByRole("medium");
		for (const medium of mediums) {
			try {
				const user = await this.client.users.fetch(medium.id);
				await user.send({
					content: `霊媒結果: ${this.nameOf(executedId)} は ${executedPlayer.role === "werewolf" ? "人狼" : "人狼ではありません"}。`,
				});
			} catch {
				// ignore
			}
		}
	}

	checkWinCondition() {
		const alive = this.alivePlayers();
		const wolves = alive.filter((p) => p.role === "werewolf").length;
		const foxes = alive.filter((p) => p.role === "fox").length;
		const nonWolves = alive.length - wolves;

		if (foxes > 0 && (wolves === 0 || wolves >= nonWolves - foxes)) {
			return "きつね陣営の勝利";
		}

		if (wolves === 0) {
			return "村人陣営の勝利";
		}

		if (wolves >= nonWolves) {
			return "人狼陣営の勝利";
		}

		return null;
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
		if (this.dayResolver) this.dayResolver();

		await this.disableRecruitButtons();

		const main = await this.getMainChannel();
		if (main) {
			await main.send({
				content: `🏁 ゲーム終了: ${reason}\n会話チャンネルは10秒後に削除されます。`,
			});
		}

		await this.postSourceMessage(`人狼ゲーム終了: ${reason}`);
		await sleep(10_000);
		await this.deleteCreatedChannels();

		sessionsByGuild.delete(this.guildId);
		sessionsByGameId.delete(this.gameId);
	}
}

const command = {
	data: new SlashCommandBuilder()
		.setName("wolfgame")
		.setDescription("人狼ゲームの募集を開始します"),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.inGuild() || !interaction.guild || !interaction.channel) {
			await interaction.reply({
				content: "このコマンドはサーバー内で実行してください。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (sessionsByGuild.has(interaction.guild.id)) {
			await interaction.reply({
				content: "このサーバーではすでに進行中の人狼ゲームがあります。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const session = new WolfGameSession({
			client: interaction.client,
			guildId: interaction.guild.id,
			hostId: interaction.user.id,
			sourceChannelId: interaction.channel.id,
		});

		sessionsByGuild.set(interaction.guild.id, session);
		sessionsByGameId.set(session.gameId, session);

		await interaction.reply({
			embeds: [session.buildRecruitEmbed()],
			components: session.buildRecruitButtons(),
		});
		const message = await interaction.fetchReply();

		session.recruitMessageId = message.id;
	},
};

const handleRecruitButton = async (
	session: WolfGameSession,
	button: ButtonInteraction,
	action: "join" | "leave" | "start",
) => {
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

const handleActionButton = async (
	session: WolfGameSession,
	button: ButtonInteraction,
	role: Role,
	targetId: string,
) => {
	if (session.phase !== "night") {
		await button.reply({
			content: "現在は夜フェーズではありません。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (!["werewolf", "seer", "knight"].includes(role)) {
		await button.reply({
			content: "この役職アクションは現在サポートされていません。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const actor = session.players.get(button.user.id);
	if (!actor?.alive || actor.role !== role) {
		await button.reply({
			content: "あなたはこのアクションを実行できません。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const rep = session.nightRepresentatives.get(role);
	if (rep && rep !== button.user.id) {
		await button.reply({
			content: `この役職のアクションは代表者 <@${rep}> のみ実行できます。`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const target = session.players.get(targetId);
	if (!target?.alive) {
		await button.reply({
			content: "対象が無効です。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (role === "werewolf" && target.role === "werewolf") {
		await button.reply({
			content: "人狼は人狼を襲撃できません。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (role === "seer" && targetId === button.user.id) {
		await button.reply({
			content: "自分自身は占えません。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (role === "werewolf") session.nightActions.werewolf = targetId;
	if (role === "seer") session.nightActions.seer = targetId;
	if (role === "knight") session.nightActions.knight = targetId;

	session.pendingNightRoles.delete(role);
	session.bumpActivity();

	await button.reply({
		content: `${ROLE_INFO[role].name}のアクションを **${session.nameOf(targetId)}** に設定しました。`,
		flags: MessageFlags.Ephemeral,
	});

	if (session.pendingNightRoles.size === 0 && session.nightResolver) {
		session.nightResolver();
	}
};

const handleVoteButton = async (
	session: WolfGameSession,
	button: ButtonInteraction,
	targetId: string,
) => {
	if (session.phase !== "day") {
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

	await button.reply({
		content: `**${session.nameOf(targetId)}** に投票しました。`,
		flags: MessageFlags.Ephemeral,
	});

	if (session.pendingVoters.size === 0 && session.dayResolver) {
		session.dayResolver();
	}
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
		await interaction.reply({
			content: "このゲームはすでに終了しています。",
			flags: MessageFlags.Ephemeral,
		});
		return true;
	}

	if (action === "join" || action === "leave" || action === "start") {
		await handleRecruitButton(session, interaction, action);
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

export default command;
