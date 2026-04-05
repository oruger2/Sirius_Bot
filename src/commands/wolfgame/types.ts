export type Role =
	| "villager"
	| "werewolf"
	| "nice_cat"
	| "wolf_cat"
	| "seer"
	| "knight"
	| "medium"
	| "fox"
	| "madman"
	| "freaks"
	| "teruteru";

export type Phase = "recruiting" | "night" | "discussion" | "vote" | "ended";

export type Team = "village" | "werewolf" | "fox" | "teruteru" | "freaks";

export type ConfigurableRole = Exclude<Role, "villager">;

export interface RoleInfo {
	name: string;
	team: Team;
	hasNightAction: boolean;
	description: string;
}

export interface PlayerState {
	id: string;
	role: Role;
	alive: boolean;
}

export interface NightActions {
	werewolf?: string;
	seer?: string;
	knight?: string;
	medium?: string;
	freaks?: FreaksAffiliation;
}

export type FreaksAffiliation = "village" | "werewolf" | "third";

export interface WolfGameSettings {
	discussionMs: number;
	voteMs: number;
	roleOverrides: Partial<Record<ConfigurableRole, number>>;
}
