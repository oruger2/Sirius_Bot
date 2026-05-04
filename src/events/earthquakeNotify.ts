import { Events, EmbedBuilder } from "discord.js";
import type { APIEmbed, Client } from "discord.js";

const TARGET_CHANNEL_ID = "1445639739188445420";
const EARTHQUAKE_API_URL =
	"https://api.p2pquake.net/v2/history?codes=551&limit=1";
const EEW_API_URL = "https://api.p2pquake.net/v2/history?codes=556&limit=1";
const POLL_INTERVAL_MS = 30_000;
const SEND_TEST_SHAKE_SCALE3_ON_BOOT = true;
const STARTUP_TEST_DELAY_MS = 20_000;
const JST_TIME_ZONE = "Asia/Tokyo";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const scaleLabelMap: Record<number, string> = {
	10: "1",
	20: "2",
	30: "3",
	40: "4",
	45: "5弱",
	50: "5強",
	55: "6弱",
	60: "6強",
	70: "7",
};

const tsunamiLabelMap: Record<string, string> = {
	None: "津波の心配なし",
	Unknown: "不明",
	Checking: "調査中",
	NonEffective: "若干の海面変動 (被害の心配なし)",
	Watch: "津波注意報",
	Warning: "津波警報",
};

type EarthquakeInfo = {
	eventKey: string;
	time: string;
	place: string;
	magnitude: number | null;
	depth: number | null;
	maxScale: number;
	tsunami: string;
	points: Array<{
		name: string;
		scale: number;
	}>;
};

type EewInfo = {
	eventKey: string;
	isTest: boolean;
	cancelled: boolean;
	issuedAt: string;
	eventId: string;
	serial: string;
	originTime: string | null;
	arrivalTime: string | null;
	hypocenterName: string;
	magnitude: number | null;
	depth: number | null;
	maxForecastScale: number | null;
};

type NotificationState = {
	eventKey: string | null;
	messageId: string | null;
	signature: string | null;
};

let earthquakeState: NotificationState = {
	eventKey: null,
	messageId: null,
	signature: null,
};
let eewState: NotificationState = {
	eventKey: null,
	messageId: null,
	signature: null,
};
let polling = false;
let pollTimer: NodeJS.Timeout | null = null;

const isShardingInProcessError = (error: unknown): boolean => {
	if (!error || typeof error !== "object") {
		return false;
	}

	const candidate = error as { name?: unknown; message?: unknown };
	return (
		candidate.name === "DiscordjsError" &&
		typeof candidate.message === "string" &&
		candidate.message.includes("Shards are still being spawned")
	);
};

const toScaleLabel = (scale: number) =>
	scaleLabelMap[scale] ?? `不明 (${scale})`;

const toScaleColor = (scale: number) => {
	if (scale >= 55) return 0xed4245;
	if (scale >= 45) return 0xf47fff;
	if (scale >= 40) return 0xffa500;
	if (scale >= 30) return 0xfee75c;
	return 0x57f287;
};

const parseApiTime = (raw: string): Date | null => {
	// P2Pの時刻はタイムゾーン無しの "YYYY/MM/DD HH:mm:ss" の場合がある。
	// その場合はJSTとして固定解釈し、実行環境のTZ差分で時刻がずれないようにする。
	const naiveJstMatch = raw.match(
		/^(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
	);
	const hasTimeZoneSuffix = /(Z|[+-]\d{2}:?\d{2})$/i.test(raw);

	if (naiveJstMatch && !hasTimeZoneSuffix) {
		const year = Number.parseInt(naiveJstMatch[1], 10);
		const month = Number.parseInt(naiveJstMatch[2], 10);
		const day = Number.parseInt(naiveJstMatch[3], 10);
		const hour = Number.parseInt(naiveJstMatch[4], 10);
		const minute = Number.parseInt(naiveJstMatch[5], 10);
		const second = Number.parseInt(naiveJstMatch[6] ?? "0", 10);
		const utcMs =
			Date.UTC(year, month - 1, day, hour, minute, second) - JST_OFFSET_MS;

		return new Date(utcMs);
	}

	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toJst = (raw: string) => {
	const date = parseApiTime(raw);
	if (!date) {
		return raw;
	}

	return date.toLocaleString("ja-JP", {
		timeZone: JST_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
};

const clampEmbedFieldValue = (value: string, maxLength = 1024): string => {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
};

const toValidNumber = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const toNonNegativeNumber = (value: unknown): number | null => {
	const normalized = toValidNumber(value);
	return normalized !== null && normalized >= 0 ? normalized : null;
};

const buildSignature = (value: unknown): string => JSON.stringify(value);

const buildIntensityMapText = (
	points: Array<{ name: string; scale: number }>,
): string => {
	if (points.length === 0) {
		return "地域ごとの震度データは取得できませんでした。";
	}

	const grouped = new Map<number, string[]>();
	for (const point of points) {
		const scale = Math.trunc(point.scale);
		if (!grouped.has(scale)) {
			grouped.set(scale, []);
		}

		grouped.get(scale)?.push(point.name);
	}

	const sortedScales = [...grouped.keys()].sort((a, b) => b - a);
	const lines: string[] = [];

	for (const scale of sortedScales) {
		const names = [...new Set(grouped.get(scale) ?? [])];
		const shown = names.slice(0, 6);
		const overflow = names.length - shown.length;
		const suffix = overflow > 0 ? ` ほか${overflow}地域` : "";
		lines.push(`震度${toScaleLabel(scale)}: ${shown.join("、")}${suffix}`);
	}

	return clampEmbedFieldValue(lines.join("\n"));
};

const fetchLatestEarthquake = async (): Promise<EarthquakeInfo | null> => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 8_000);

	try {
		const response = await fetch(EARTHQUAKE_API_URL, {
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const payload = (await response.json()) as unknown;
		if (!Array.isArray(payload) || payload.length === 0) {
			return null;
		}

		const item = payload[0] as {
			id?: string;
			time?: string;
			earthquake?: {
				time?: string;
				maxScale?: number;
				domesticTsunami?: string;
				hypocenter?: {
					name?: string;
					magnitude?: number;
					depth?: number;
				};
			};
			points?: Array<{
				addr?: string;
				pref?: string;
				scale?: number;
			}>;
		};

		const quake = item.earthquake;
		if (!quake || typeof quake.maxScale !== "number") {
			return null;
		}

		const place = quake.hypocenter?.name ?? "不明";
		const magnitude = toNonNegativeNumber(quake.hypocenter?.magnitude);
		const depth = toNonNegativeNumber(quake.hypocenter?.depth);
		const time = quake.time ?? item.time ?? new Date().toISOString();
		const eventKey =
			typeof item.id === "string" && item.id.length > 0
				? item.id
				: `${time}-${place}-${quake.maxScale}-${magnitude ?? "na"}`;
		const points = Array.isArray(item.points)
			? item.points
					.map((point) => {
						const nameCandidate =
							typeof point.addr === "string" && point.addr.trim().length > 0
								? point.addr.trim()
								: typeof point.pref === "string" && point.pref.trim().length > 0
									? point.pref.trim()
									: null;

						return nameCandidate && typeof point.scale === "number"
							? { name: nameCandidate, scale: point.scale }
							: null;
					})
					.filter(
						(point): point is { name: string; scale: number } => point !== null,
					)
			: [];

		return {
			eventKey,
			time,
			place,
			magnitude,
			depth,
			maxScale: quake.maxScale,
			tsunami:
				tsunamiLabelMap[quake.domesticTsunami ?? ""] ??
				quake.domesticTsunami ??
				"不明",
			points,
		};
	} catch (error) {
		console.error("❌ 地震情報の取得に失敗", error);
		return null;
	} finally {
		clearTimeout(timeout);
	}
};

const fetchLatestEew = async (): Promise<EewInfo | null> => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 8_000);

	try {
		const response = await fetch(EEW_API_URL, {
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const payload = (await response.json()) as unknown;
		if (!Array.isArray(payload) || payload.length === 0) {
			return null;
		}

		const item = payload[0] as {
			id?: string;
			test?: boolean;
			cancelled?: boolean;
			issue?: {
				time?: string;
				eventId?: string;
				serial?: string;
			};
			earthquake?: {
				originTime?: string;
				arrivalTime?: string;
				hypocenter?: {
					name?: string;
					depth?: number;
					magnitude?: number;
				};
			};
			areas?: Array<{
				scaleFrom?: number;
				scaleTo?: number;
			}>;
		};

		const issue = item.issue;
		if (!issue || typeof issue.time !== "string") {
			return null;
		}

		const areaScales = Array.isArray(item.areas)
			? item.areas
					.flatMap((area) => [
						toValidNumber(area.scaleTo),
						toValidNumber(area.scaleFrom),
					])
					.filter((value): value is number => value !== null)
			: [];
		const maxForecastScale =
			areaScales.length > 0
				? Math.max(...areaScales.map((v) => Math.trunc(v)))
				: null;

		const depth = toNonNegativeNumber(item.earthquake?.hypocenter?.depth);
		const magnitude = toNonNegativeNumber(
			item.earthquake?.hypocenter?.magnitude,
		);
		const originTime =
			typeof item.earthquake?.originTime === "string"
				? item.earthquake.originTime
				: null;
		const arrivalTime =
			typeof item.earthquake?.arrivalTime === "string"
				? item.earthquake.arrivalTime
				: null;
		const eventKey =
			typeof item.id === "string" && item.id.length > 0
				? item.id
				: `${issue.eventId ?? "unknown"}-${issue.serial ?? "0"}-${issue.time}`;

		return {
			eventKey,
			isTest: item.test === true,
			cancelled: item.cancelled === true,
			issuedAt: issue.time,
			eventId: issue.eventId ?? "不明",
			serial: issue.serial ?? "不明",
			originTime,
			arrivalTime,
			hypocenterName: item.earthquake?.hypocenter?.name ?? "不明",
			magnitude,
			depth,
			maxForecastScale,
		};
	} catch (error) {
		console.error("❌ 緊急地震速報の取得に失敗", error);
		return null;
	} finally {
		clearTimeout(timeout);
	}
};

const buildTestScale3Earthquake = (): EarthquakeInfo => {
	const time = new Date().toISOString();

	return {
		eventKey: `test-scale3-${time}`,
		time,
		place: "テスト震源",
		magnitude: 4.8,
		depth: 20,
		maxScale: 30,
		tsunami: tsunamiLabelMap.None,
		points: [
			{ name: "東京都", scale: 30 },
			{ name: "神奈川県", scale: 20 },
			{ name: "千葉県", scale: 20 },
		],
	};
};

const buildEarthquakeEmbed = (quake: EarthquakeInfo): APIEmbed => {
	const magnitudeText =
		typeof quake.magnitude === "number" ? quake.magnitude.toFixed(1) : "不明";
	const depthText =
		typeof quake.depth === "number" && quake.depth >= 0
			? `${quake.depth}km`
			: "不明";
	const quakeDate = parseApiTime(quake.time);

	return new EmbedBuilder()
		.setTitle(`地震速報 | 最大震度 ${toScaleLabel(quake.maxScale)}`)
		.setDescription("最新の地震情報を検知しました。")
		.addFields(
			{ name: "震源地", value: quake.place, inline: true },
			{ name: "マグニチュード", value: magnitudeText, inline: true },
			{ name: "深さ", value: depthText, inline: true },
			{ name: "発生時刻 (JST)", value: toJst(quake.time), inline: false },
			{ name: "津波", value: quake.tsunami, inline: false },
			{
				name: "震度マップ（地域別）",
				value: buildIntensityMapText(quake.points),
				inline: false,
			},
		)
		.setColor(toScaleColor(quake.maxScale))
		.setFooter({ text: "Data: P2P地震情報" })
		.setTimestamp(quakeDate ?? new Date())
		.toJSON();
};

const toForecastScaleLabel = (scale: number | null) => {
	if (scale === null) return "不明";

	const normalized = Math.trunc(scale);
	if (normalized === -1) return "不明";
	if (normalized === 0) return "0";
	if (normalized === 99) return "不明 (〜程度以上)";

	return toScaleLabel(normalized);
};

const buildEewEmbed = (eew: EewInfo): APIEmbed => {
	const magnitudeText =
		typeof eew.magnitude === "number" ? eew.magnitude.toFixed(1) : "不明";
	const depthText =
		typeof eew.depth === "number" && eew.depth >= 0 ? `${eew.depth}km` : "不明";

	const embed = new EmbedBuilder()
		.setTitle(
			eew.cancelled
				? "緊急地震速報（警報）| 取消"
				: `緊急地震速報（警報）| 予測最大震度 ${toForecastScaleLabel(eew.maxForecastScale)}`,
		)
		.setDescription(
			eew.cancelled
				? "緊急地震速報（警報）が取り消されました。"
				: "緊急地震速報（警報）が発表されました。",
		)
		.addFields(
			{ name: "発表時刻", value: toJst(eew.issuedAt), inline: true },
			{ name: "情報番号", value: `${eew.eventId}-${eew.serial}`, inline: true },
			{ name: "震央地名", value: eew.hypocenterName, inline: true },
			{ name: "マグニチュード", value: magnitudeText, inline: true },
			{ name: "深さ", value: depthText, inline: true },
			{
				name: "主要動到達予想",
				value: eew.arrivalTime ? toJst(eew.arrivalTime) : "不明",
				inline: true,
			},
			{
				name: "地震発生時刻",
				value: eew.originTime ? toJst(eew.originTime) : "不明",
				inline: false,
			},
		)
		.setColor(eew.cancelled ? 0x95a5a6 : 0xed4245)
		.setFooter({ text: "Data: P2P地震情報 (緊急地震速報)" })
		.setTimestamp(new Date());

	if (eew.isTest) {
		embed.addFields({ name: "区分", value: "テスト報", inline: true });
	}

	return embed.toJSON();
};

const sendToConfiguredChannel = async (
	client: Client,
	channelId: string,
	embed: APIEmbed,
	messageId?: string | null,
): Promise<string | null> => {
	if (client.shard) {
		try {
			const results = await client.shard.broadcastEval(
				async (c, context) => {
					const ch = await c.channels
						.fetch(context.channelId)
						.catch(() => null);
					if (!ch?.isTextBased() || !ch.isSendable()) {
						return null;
					}

					const existingMessage =
						typeof context.messageId === "string" &&
						context.messageId.length > 0
							? await ch.messages.fetch(context.messageId).catch(() => null)
							: null;

					if (existingMessage) {
						try {
							await existingMessage.edit({ embeds: [context.embed] });
							return existingMessage.id;
						} catch {
							const newMessage = await ch.send({ embeds: [context.embed] });
							return newMessage.id;
						}
					}

					const sentMessage = await ch.send({ embeds: [context.embed] });
					return sentMessage.id;
				},
				{ context: { channelId, embed, messageId } },
			);

			return (
				results.find(
					(result): result is string =>
						typeof result === "string" && result.length > 0,
				) ?? null
			);
		} catch (error) {
			if (isShardingInProcessError(error)) {
				console.warn(
					"⏳ Shard起動中のため地震通知を次回ポーリングで再試行します。",
				);
				return null;
			}

			throw error;
		}
	}

	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!channel?.isTextBased() || !channel.isSendable()) {
		return null;
	}

	const existingMessage =
		typeof messageId === "string" && messageId.length > 0
			? await channel.messages.fetch(messageId).catch(() => null)
			: null;

	if (existingMessage) {
		try {
			await existingMessage.edit({ embeds: [embed] });
			return existingMessage.id;
		} catch {
			const newMessage = await channel.send({ embeds: [embed] });
			return newMessage.id;
		}
	}

	const sentMessage = await channel.send({ embeds: [embed] });
	return sentMessage.id;
};

const pollEarthquake = async (
	client: Client,
	options?: { useTestScale3?: boolean },
) => {
	if (polling) {
		return;
	}

	polling = true;
	try {
		const [quake, eew] = await Promise.all([
			options?.useTestScale3
				? Promise.resolve(buildTestScale3Earthquake())
				: fetchLatestEarthquake(),
			fetchLatestEew(),
		]);

		if (quake) {
			const embed = buildEarthquakeEmbed(quake);
			const signature = buildSignature(quake);
			const isSameEvent = earthquakeState.eventKey === quake.eventKey;
			const shouldSendOrUpdate =
				!isSameEvent || earthquakeState.signature !== signature;

			if (shouldSendOrUpdate) {
				const messageId = await sendToConfiguredChannel(
					client,
					TARGET_CHANNEL_ID,
					embed,
					isSameEvent ? earthquakeState.messageId : null,
				);

				if (messageId) {
					earthquakeState = {
						eventKey: quake.eventKey,
						messageId,
						signature,
					};
					console.log(
						`${options?.useTestScale3 ? "🧪 テスト" : isSameEvent ? "📝 更新" : "📨 送信"} 地震通知: ${quake.place} / 最大震度 ${toScaleLabel(quake.maxScale)}`,
					);
				} else {
					console.warn(
						`⚠️ 地震通知先チャンネルへ送信できませんでした: ${TARGET_CHANNEL_ID}`,
					);
				}
			}
		}

		if (eew) {
			const embed = buildEewEmbed(eew);
			const signature = buildSignature(eew);
			const isSameEvent = eewState.eventKey === eew.eventKey;
			const shouldSendOrUpdate =
				!isSameEvent || eewState.signature !== signature;

			if (shouldSendOrUpdate) {
				const messageId = await sendToConfiguredChannel(
					client,
					TARGET_CHANNEL_ID,
					embed,
					isSameEvent ? eewState.messageId : null,
				);

				if (messageId) {
					eewState = {
						eventKey: eew.eventKey,
						messageId,
						signature,
					};
					console.log(
						`${isSameEvent ? "📝 更新" : "🚨 送信"} 緊急地震速報: ${eew.hypocenterName} / 予測最大震度 ${toForecastScaleLabel(eew.maxForecastScale)}`,
					);
				} else {
					console.warn(
						`⚠️ 緊急地震速報の通知先チャンネルへ送信できませんでした: ${TARGET_CHANNEL_ID}`,
					);
				}
			}
		}
	} catch (error) {
		console.error("❌ 地震通知処理でエラー", error);
	} finally {
		polling = false;
	}
};

export default {
	name: Events.ClientReady,
	once: true,
	async execute(client: Client) {
		const shardId = client.shard?.ids?.[0] ?? 0;
		if (shardId !== 0) {
			return;
		}

		if (!TARGET_CHANNEL_ID.trim()) {
			console.warn("⚠️ earthquakeNotify.ts の TARGET_CHANNEL_ID が未設定です。");
			return;
		}

		if (pollTimer) {
			return;
		}

		if (SEND_TEST_SHAKE_SCALE3_ON_BOOT) {
			setTimeout(() => {
				void pollEarthquake(client, { useTestScale3: true });
			}, STARTUP_TEST_DELAY_MS);
		}

		setTimeout(() => {
			void pollEarthquake(client);
		}, 5_000);

		pollTimer = setInterval(() => {
			void pollEarthquake(client);
		}, POLL_INTERVAL_MS);
		pollTimer.unref?.();

		console.log("🌎 地震情報 / 緊急地震速報の監視を開始しました。");
	},
};
