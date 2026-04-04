import type {
	ButtonInteraction,
	ChatInputCommandInteraction,
	Client,
	Guild,
	ModalSubmitInteraction,
} from "discord.js";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	MessageFlags,
	ModalBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";

type Role =
	| "villager"
	| "werewolf"
	| "seer"
	| "knight"
	| "medium"
	| "fox"
	| "madman"
	| "teruteru";

type Phase = "recruiting" | "night" | "discussion" | "vote" | "ended";

type Team = "village" | "werewolf" | "fox" | "teruteru";

type ConfigurableRole = Exclude<Role, "villager">;

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
	medium?: string;
}

interface WolfGameSettings {
	discussionMs: number;
	voteMs: number;
	roleOverrides: Partial<Record<ConfigurableRole, number>>;
}

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 15;
const DEFAULT_DISCUSSION_MS = 5 * 60 * 1000;
const DEFAULT_VOTE_MS = 2 * 60 * 1000;
const NIGHT_ACTION_MS = 5 * 60 * 1000;
const INACTIVITY_MS = 15 * 60 * 1000;

const ROLE_INFO: Record<Role, RoleInfo> = {
	villager: { name: "村人", team: "village", hasNightAction: false },
	werewolf: { name: "人狼", team: "werewolf", hasNightAction: true },
	seer: { name: "占い師", team: "village", hasNightAction: true },
	knight: { name: "騎士", team: "village", hasNightAction: true },
	medium: { name: "霊媒師", team: "village", hasNightAction: true },
	fox: { name: "きつね", team: "fox", hasNightAction: false },
	madman: { name: "狂人", team: "werewolf", hasNightAction: false },
	teruteru: { name: "てるてる", team: "teruteru", hasNightAction: false },
};

const ROLE_ORDER: Role[] = [
	"werewolf",
	"madman",
	"seer",
	"knight",
	"medium",
	"fox",
	"teruteru",
	"villager",
];

const CONFIGURABLE_ROLE_ORDER: ConfigurableRole[] = [
	"werewolf",
	"madman",
	"seer",
	"knight",
	"medium",
	"fox",
	"teruteru",
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
	const teruteru = 0;

	const occupied = werewolf + madman + seer + knight + medium + fox + teruteru;
	const villager = Math.max(0, count - occupied);

	return {
		villager,
		werewolf,
		seer,
		knight,
		medium,
		fox,
		madman,
		teruteru,
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

const formatDurationMinutes = (ms: number) => `${Math.floor(ms / 60_000)}分`;

const resolveRoleConfig = (
	count: number,
	roleOverrides: Partial<Record<ConfigurableRole, number>>,
) => {
	const config = roleConfigForPlayerCount(count);

	for (const role of CONFIGURABLE_ROLE_ORDER) {
		const override = roleOverrides[role];
		if (typeof override === "number") {
			config[role] = override;
		}
	}

	const occupied = CONFIGURABLE_ROLE_ORDER.reduce(
		(total, role) => total + config[role],
		0,
	);
	if (occupied > count) return null;

	config.villager = count - occupied;
	return config;
};

const parseWholeNumber = (value: string, label: string) => {
	if (!/^\d+$/.test(value.trim())) {
		return {
			ok: false as const,
			message: `${label}は0以上の整数で入力してください。`,
		};
	}

	return { ok: true as const, value: Number.parseInt(value.trim(), 10) };
};

const parseMinuteInput = (value: string, label: string) => {
	const parsed = parseWholeNumber(value, label);
	if (!parsed.ok) return parsed;
	if (parsed.value < 1 || parsed.value > 30) {
		return {
			ok: false as const,
			message: `${label}は1〜30分の範囲で入力してください。`,
		};
	}

	return { ok: true as const, value: parsed.value * 60_000 };
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
	mediumInspected = new Set<string>();
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
					.setCustomId(`wolf:config_roles:${this.gameId}`)
					.setLabel("役職設定")
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(disabled),
				new ButtonBuilder()
					.setCustomId(`wolf:config_rules:${this.gameId}`)
					.setLabel("時間・追加設定")
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
		const werewolves = this.aliveByRole("werewolf").map((player) => player.id);

		for (const player of this.players.values()) {
			const teamText =
				ROLE_INFO[player.role].team === "village"
					? "村人陣営"
					: ROLE_INFO[player.role].team === "werewolf"
						? "人狼陣営"
						: ROLE_INFO[player.role].team === "fox"
							? "きつね陣営"
							: "てるてる陣営";

			const lines = [
				`あなたの役職は **${ROLE_INFO[player.role].name}** です。`,
				`陣営: **${teamText}**`,
			];

			if (player.role === "werewolf") {
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

		if (
			!resolveRoleConfig(this.participantCount(), this.settings.roleOverrides)
		) {
			await trigger.reply({
				content:
					"現在の役職設定では参加人数を超えています。役職数を見直してから開始してください。",
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
		if (
			alive.some((p) => p.role === "medium") &&
			this.deadUninspectedPlayers().length > 0
		) {
			required.push("medium");
		}
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

			let targets =
				role === "medium" ? this.deadUninspectedPlayers() : this.alivePlayers();
			if (role === "werewolf") {
				targets = targets.filter((p) => p.role !== "werewolf");
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

			let targets =
				role === "medium" ? this.deadUninspectedPlayers() : this.alivePlayers();
			if (role === "werewolf")
				targets = targets.filter((p) => p.role !== "werewolf");
			if (role === "seer") targets = targets.filter((p) => p.id !== rep);
			if (role === "knight") targets = targets.filter((p) => p.id !== rep);

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
		const knightActorId = this.nightRepresentatives.get("knight");

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

		if (mediumTargetId) {
			const mediumTarget = this.players.get(mediumTargetId);
			const aliveMediums = this.aliveByRole("medium");
			if (mediumTarget && !mediumTarget.alive) {
				this.mediumInspected.add(mediumTarget.id);
				for (const medium of aliveMediums) {
					try {
						const user = await this.client.users.fetch(medium.id);
						await user.send({
							content: `霊媒結果: ${this.nameOf(mediumTarget.id)} は ${mediumTarget.role === "werewolf" ? "人狼" : "人狼ではありません"}。`,
						});
					} catch {
						// ignore
					}
				}
			}
		}

		if (guardTargetId && knightActorId) {
			const guardTarget = this.players.get(guardTargetId);
			const knightActor = this.players.get(knightActorId);
			if (
				guardTarget?.alive &&
				knightActor?.alive &&
				guardTarget.role === "werewolf"
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

		await main.send({
			content: `🗣️ 議論時間は${formatDurationMinutes(this.settings.discussionMs)}です。終了後に投票時間へ移ります。`,
		});

		await new Promise<void>((resolve) => {
			this.phaseTimer = setTimeout(resolve, this.settings.discussionMs);
			this.phaseTimer?.unref?.();
		});

		if (this.phaseTimer) {
			clearTimeout(this.phaseTimer);
			this.phaseTimer = null;
		}

		await this.setMainTalkPermission(false);

		this.phase = "vote";
		this.votes.clear();
		this.pendingVoters = new Set(this.alivePlayerIds());

		const alive = this.alivePlayers();
		const voteRows = this.buildVoteButtons(alive);

		await main.send({
			content: `🗳️ 投票時間は${formatDurationMinutes(this.settings.voteMs)}です。未投票者は無効票扱いになります。`,
			components: voteRows,
		});

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

		if (executedPlayer.role === "teruteru") {
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
			await this.postSourceMessage(`人狼ゲーム終了: ${reason}`);
			await sleep(10_000);
			await this.deleteCreatedChannels();
		} else {
			await this.postSourceMessage(`人狼ゲーム終了: ${reason}`);
		}

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
	action:
		| "join"
		| "leave"
		| "start"
		| "dismiss"
		| "config_roles"
		| "config_rules",
) => {
	if (action === "config_roles" || action === "config_rules") {
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

		const modal =
			action === "config_roles"
				? new ModalBuilder()
						.setCustomId(`wolf:modal_roles:${session.gameId}`)
						.setTitle("役職設定")
						.addComponents(
							new ActionRowBuilder<TextInputBuilder>().addComponents(
								new TextInputBuilder()
									.setCustomId("werewolf")
									.setLabel("人狼")
									.setStyle(TextInputStyle.Short)
									.setRequired(true)
									.setValue(
										String(
											session.settings.roleOverrides.werewolf ??
												roleConfigForPlayerCount(
													Math.max(session.participantCount(), MIN_PLAYERS),
												).werewolf,
										),
									),
							),
							new ActionRowBuilder<TextInputBuilder>().addComponents(
								new TextInputBuilder()
									.setCustomId("madman")
									.setLabel("狂人")
									.setStyle(TextInputStyle.Short)
									.setRequired(true)
									.setValue(
										String(
											session.settings.roleOverrides.madman ??
												roleConfigForPlayerCount(
													Math.max(session.participantCount(), MIN_PLAYERS),
												).madman,
										),
									),
							),
							new ActionRowBuilder<TextInputBuilder>().addComponents(
								new TextInputBuilder()
									.setCustomId("seer")
									.setLabel("占い師")
									.setStyle(TextInputStyle.Short)
									.setRequired(true)
									.setValue(
										String(
											session.settings.roleOverrides.seer ??
												roleConfigForPlayerCount(
													Math.max(session.participantCount(), MIN_PLAYERS),
												).seer,
										),
									),
							),
							new ActionRowBuilder<TextInputBuilder>().addComponents(
								new TextInputBuilder()
									.setCustomId("knight")
									.setLabel("騎士")
									.setStyle(TextInputStyle.Short)
									.setRequired(true)
									.setValue(
										String(
											session.settings.roleOverrides.knight ??
												roleConfigForPlayerCount(
													Math.max(session.participantCount(), MIN_PLAYERS),
												).knight,
										),
									),
							),
							new ActionRowBuilder<TextInputBuilder>().addComponents(
								new TextInputBuilder()
									.setCustomId("medium")
									.setLabel("霊媒師")
									.setStyle(TextInputStyle.Short)
									.setRequired(true)
									.setValue(
										String(
											session.settings.roleOverrides.medium ??
												roleConfigForPlayerCount(
													Math.max(session.participantCount(), MIN_PLAYERS),
												).medium,
										),
									),
							),
						)
				: new ModalBuilder()
						.setCustomId(`wolf:modal_rules:${session.gameId}`)
						.setTitle("時間・追加設定")
						.addComponents(
							new ActionRowBuilder<TextInputBuilder>().addComponents(
								new TextInputBuilder()
									.setCustomId("fox")
									.setLabel("きつね")
									.setStyle(TextInputStyle.Short)
									.setRequired(true)
									.setValue(
										String(
											session.settings.roleOverrides.fox ??
												roleConfigForPlayerCount(
													Math.max(session.participantCount(), MIN_PLAYERS),
												).fox,
										),
									),
							),
							new ActionRowBuilder<TextInputBuilder>().addComponents(
								new TextInputBuilder()
									.setCustomId("teruteru")
									.setLabel("てるてる")
									.setStyle(TextInputStyle.Short)
									.setRequired(true)
									.setValue(
										String(session.settings.roleOverrides.teruteru ?? 0),
									),
							),
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

	if (!["werewolf", "seer", "knight", "medium"].includes(role)) {
		return {
			ok: false,
			content: "この役職アクションは現在サポートされていません。",
		};
	}

	const actor = session.players.get(actorId);
	if (!actor?.alive || actor.role !== role) {
		return { ok: false, content: "あなたはこのアクションを実行できません。" };
	}

	const rep = session.nightRepresentatives.get(role);
	if (rep && rep !== actorId) {
		return {
			ok: false,
			content: `この役職のアクションは代表者 <@${rep}> のみ実行できます。`,
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

	if (role === "werewolf" && target.role === "werewolf") {
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

	if (action === "modal_roles") {
		const roleValues = {
			werewolf: interaction.fields.getTextInputValue("werewolf"),
			madman: interaction.fields.getTextInputValue("madman"),
			seer: interaction.fields.getTextInputValue("seer"),
			knight: interaction.fields.getTextInputValue("knight"),
			medium: interaction.fields.getTextInputValue("medium"),
		} satisfies Record<
			Extract<
				ConfigurableRole,
				"werewolf" | "madman" | "seer" | "knight" | "medium"
			>,
			string
		>;

		const nextOverrides = { ...session.settings.roleOverrides };
		for (const [role, rawValue] of Object.entries(roleValues)) {
			const parsed = parseWholeNumber(
				rawValue,
				ROLE_INFO[role as ConfigurableRole].name,
			);
			if (!parsed.ok) {
				await interaction.reply({
					content: parsed.message,
					flags: MessageFlags.Ephemeral,
				});
				return true;
			}
			nextOverrides[role as ConfigurableRole] = parsed.value;
		}

		if (
			!resolveRoleConfig(
				Math.max(session.participantCount(), MIN_PLAYERS),
				nextOverrides,
			)
		) {
			await interaction.reply({
				content:
					"その役職設定だと参加人数に対して役職数が多すぎます。数を減らしてください。",
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}

		session.settings.roleOverrides = nextOverrides;
		session.bumpActivity();
		await session.updateRecruitMessage();
		await interaction.reply({
			content: "役職設定を更新しました。",
			flags: MessageFlags.Ephemeral,
		});
		return true;
	}

	if (action === "modal_rules") {
		const fox = parseWholeNumber(
			interaction.fields.getTextInputValue("fox"),
			ROLE_INFO.fox.name,
		);
		const teruteru = parseWholeNumber(
			interaction.fields.getTextInputValue("teruteru"),
			ROLE_INFO.teruteru.name,
		);
		const discussion = parseMinuteInput(
			interaction.fields.getTextInputValue("discussionMinutes"),
			"議論時間",
		);
		const vote = parseMinuteInput(
			interaction.fields.getTextInputValue("voteMinutes"),
			"投票時間",
		);

		for (const result of [fox, teruteru, discussion, vote]) {
			if (!result.ok) {
				await interaction.reply({
					content: result.message,
					flags: MessageFlags.Ephemeral,
				});
				return true;
			}
		}

		if (!discussion.ok || !vote.ok || !fox.ok || !teruteru.ok) {
			return true;
		}

		const nextOverrides = {
			...session.settings.roleOverrides,
			fox: fox.value,
			teruteru: teruteru.value,
		};
		if (
			!resolveRoleConfig(
				Math.max(session.participantCount(), MIN_PLAYERS),
				nextOverrides,
			)
		) {
			await interaction.reply({
				content:
					"その設定だと参加人数に対して役職数が多すぎます。数を減らしてください。",
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}

		session.settings.roleOverrides = nextOverrides;
		session.settings.discussionMs = discussion.value;
		session.settings.voteMs = vote.value;
		session.bumpActivity();
		await session.updateRecruitMessage();
		await interaction.reply({
			content: "時間・追加設定を更新しました。",
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
		action === "config_roles" ||
		action === "config_rules"
	) {
		await handleRecruitButton(session, interaction, action);
		return true;
	}

	if (action === "force_end") {
		await handleForceEndButton(session, interaction);
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
