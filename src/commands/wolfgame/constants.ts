import type { ConfigurableRole, Role, RoleInfo } from "./types";

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;
export const DEFAULT_DISCUSSION_MS = 5 * 60 * 1000;
export const DEFAULT_VOTE_MS = 2 * 60 * 1000;
export const NIGHT_ACTION_MS = 5 * 60 * 1000;
export const INACTIVITY_MS = 15 * 60 * 1000;

export const ROLE_INFO: Record<Role, RoleInfo> = {
	villager: {
		name: "村人",
		team: "village",
		hasNightAction: false,
		description: "能力はありません。人狼を全滅させれば勝利です。",
	},
	werewolf: {
		name: "人狼",
		team: "werewolf",
		hasNightAction: true,
		description: "夜に1人襲撃できます。村人以上になれば勝利です。",
	},
	nice_cat: {
		name: "ナイス猫又",
		team: "village",
		hasNightAction: false,
		description: "能力はありません。村人陣営として人狼の全滅を目指します。",
	},
	wolf_cat: {
		name: "猫又",
		team: "werewolf",
		hasNightAction: false,
		description: "人狼陣営です。占い/霊媒では人狼として判定されます。",
	},
	seer: {
		name: "占い師",
		team: "village",
		hasNightAction: true,
		description: "夜に1人を占い、人狼かどうかを確認できます。",
	},
	knight: {
		name: "騎士",
		team: "village",
		hasNightAction: true,
		description: "夜に1人を護衛できます。自分は護衛不可です。",
	},
	medium: {
		name: "霊媒師",
		team: "village",
		hasNightAction: true,
		description: "夜に死者を1人選び、人狼かどうかを判定できます。",
	},
	fox: {
		name: "きつね",
		team: "fox",
		hasNightAction: false,
		description: "最後まで生き残ると勝利します。占われると死亡します。",
	},
	madman: {
		name: "狂人",
		team: "werewolf",
		hasNightAction: false,
		description: "人狼陣営です。人狼の勝利があなたの勝利です。",
	},
	freaks: {
		name: "フリークス",
		team: "freaks",
		hasNightAction: true,
		description:
			"毎晩、自分の所属を村人陣営/人狼陣営/第三陣営へ変更できます。最終日に所属していた陣営が勝利すればあなたも勝利です。",
	},
	teruteru: {
		name: "てるてる",
		team: "teruteru",
		hasNightAction: false,
		description: "処刑されると即勝利します。",
	},
};

export const ROLE_ORDER: Role[] = [
	"werewolf",
	"wolf_cat",
	"madman",
	"seer",
	"knight",
	"medium",
	"fox",
	"freaks",
	"teruteru",
	"nice_cat",
	"villager",
];

export const CONFIGURABLE_ROLE_ORDER: ConfigurableRole[] = [
	"werewolf",
	"wolf_cat",
	"madman",
	"seer",
	"knight",
	"medium",
	"fox",
	"freaks",
	"teruteru",
	"nice_cat",
];

export const shuffle = <T>(values: T[]) => {
	const cloned = [...values];
	for (let i = cloned.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[cloned[i], cloned[j]] = [cloned[j], cloned[i]];
	}
	return cloned;
};

export const pickRandom = <T>(values: T[]): T | undefined => {
	if (values.length === 0) return undefined;
	return values[Math.floor(Math.random() * values.length)];
};

export const chunk = <T>(values: T[], size: number): T[][] => {
	const results: T[][] = [];
	for (let i = 0; i < values.length; i += size) {
		results.push(values.slice(i, i + size));
	}
	return results;
};

export const roleConfigForPlayerCount = (
	count: number,
): Record<Role, number> => {
	const werewolf = count >= 13 ? 3 : count >= 9 ? 2 : 1;
	const wolf_cat = 0;
	const madman = 0;
	const seer = 1;
	const knight = count >= 15 ? 2 : 1;
	const medium = count >= 6 ? 1 : 0;
	const fox = count >= 14 ? 2 : count >= 8 ? 1 : 0;
	const freaks = count >= 12 ? 1 : 0;
	const teruteru = 0;
	const nice_cat = count >= 8 ? 1 : 0;

	const occupied =
		werewolf +
		wolf_cat +
		madman +
		seer +
		knight +
		medium +
		fox +
		freaks +
		teruteru +
		nice_cat;
	const villager = Math.max(0, count - occupied);

	return {
		villager,
		werewolf,
		wolf_cat,
		nice_cat,
		seer,
		knight,
		medium,
		fox,
		madman,
		freaks,
		teruteru,
	};
};

export const maxWerewolfForPlayerCount = (count: number) => {
	if (count >= 13) return 3;
	if (count >= 9) return 2;
	return 1;
};

export const requiredWerewolfTeamForPlayerCount = (count: number) => {
	if (count >= 13) return 3;
	if (count >= 9) return 2;
	return 1;
};

export const validateResolvedRoleConfig = (
	count: number,
	config: Record<Role, number>,
) => {
	const occupied = CONFIGURABLE_ROLE_ORDER.reduce(
		(total, role) => total + config[role],
		0,
	);
	if (occupied > count) {
		return "役職数が参加人数を超えています。";
	}

	const maxWerewolf = maxWerewolfForPlayerCount(count);
	if (config.werewolf < 1) {
		return "人狼は1人以上に設定してください。";
	}
	if (config.werewolf > maxWerewolf) {
		return `この人数では人狼は最大${maxWerewolf}人までです。`;
	}

	const werewolfTeam = config.werewolf + config.wolf_cat + config.madman;
	const requiredWerewolfTeam = requiredWerewolfTeamForPlayerCount(count);
	if (werewolfTeam !== requiredWerewolfTeam) {
		return `この人数では人狼陣営の合計人数を${requiredWerewolfTeam}人にしてください。`;
	}

	return null;
};

export const roleArrayFromConfig = (config: Record<Role, number>): Role[] => {
	const roles: Role[] = [];
	for (const role of ROLE_ORDER) {
		for (let i = 0; i < config[role]; i += 1) {
			roles.push(role);
		}
	}
	return roles;
};

export const formatRoleConfig = (config: Record<Role, number>) => {
	return ROLE_ORDER.filter((role) => config[role] > 0)
		.map((role) => `${ROLE_INFO[role].name} x${config[role]}`)
		.join(" / ");
};

export const formatDurationMinutes = (ms: number) =>
	`${Math.floor(ms / 60_000)}分`;

export const resolveRoleConfig = (
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
	if (validateResolvedRoleConfig(count, config)) return null;
	return config;
};

export const parseWholeNumber = (value: string, label: string) => {
	if (!/^\d+$/.test(value.trim())) {
		return {
			ok: false as const,
			message: `${label}は0以上の整数で入力してください。`,
		};
	}

	return { ok: true as const, value: Number.parseInt(value.trim(), 10) };
};

export const parseMinuteInput = (value: string, label: string) => {
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

export const makeId = () =>
	`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const sleep = (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
