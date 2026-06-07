import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	ComponentType,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";

interface Food {
	name: string;
	danger: number;
	deathReason: string;
	image?: string;
}

interface GameState {
	day: number;
	hunger: number;
	hp: number;
	currentFood: Food;
	mustEat: boolean;
}
const foods: Food[] = [
	{
		name: "おにぎり",
		danger: 0,
		deathReason: "おにぎりが喉に詰まった",
	},
	{
		name: "ハンバーガー",
		danger: 1,
		deathReason: "ハンバーガーを食べすぎた",
	},
	{
		name: "カレー",
		danger: 2,
		deathReason: "カレーを飲み込むのに失敗した",
	},
	{
		name: "ラーメン",
		danger: 3,
		deathReason: "ラーメンのスープでむせた",
	},
	{
		name: "うどん",
		danger: 4,
		deathReason: "うどんを勢いよくすすりすぎた",
	},
	{
		name: "寿司",
		danger: 5,
		deathReason: "寿司を丸飲みした",
	},
	{
		name: "ピザ",
		danger: 6,
		deathReason: "ピザを食べすぎた",
	},
	{
		name: "唐揚げ",
		danger: 7,
		deathReason: "唐揚げが喉に詰まった",
	},
	{
		name: "ケーキ",
		danger: 8,
		deathReason: "ケーキを一気食いした",
	},
	{
		name: "アイス",
		danger: 9,
		deathReason: "頭がキーンとなりすぎた",
	},

	{
		name: "消しゴム",
		danger: 12,
		deathReason: "消しゴムが喉に詰まった",
	},
	{
		name: "ティッシュ",
		danger: 14,
		deathReason: "ティッシュが気管を塞いだ",
	},
	{
		name: "紙",
		danger: 15,
		deathReason: "紙を飲み込みすぎた",
	},
	{
		name: "段ボール",
		danger: 18,
		deathReason: "段ボールが胃で膨張した",
	},
	{
		name: "綿あめみたいな綿",
		danger: 19,
		deathReason: "綿が喉に絡まった",
	},
	{
		name: "クレヨン",
		danger: 11,
		deathReason: "クレヨンを食べ続けた",
	},
	{
		name: "色鉛筆",
		danger: 22,
		deathReason: "色鉛筆の芯が刺さった",
	},
	{
		name: "鉛筆",
		danger: 25,
		deathReason: "鉛筆を噛み砕こうとした",
	},
	{
		name: "チョーク",
		danger: 20,
		deathReason: "チョークの粉でむせた",
	},
	{
		name: "スライム",
		danger: 14,
		deathReason: "スライムが気管に入った",
	},

	{
		name: "のり",
		danger: 16,
		deathReason: "のりで口が塞がった",
	},
	{
		name: "石鹸",
		danger: 24,
		deathReason: "石鹸の泡で呼吸できなくなった",
	},
	{
		name: "ロウソク",
		danger: 26,
		deathReason: "ロウが喉で固まった",
	},
	{
		name: "木の枝",
		danger: 28,
		deathReason: "木の破片が刺さった",
	},
	{
		name: "ビー玉",
		danger: 17,
		deathReason: "ビー玉が喉に詰まった",
	},
	{
		name: "ボタン",
		danger: 24,
		deathReason: "ボタンを飲み込んだ",
	},
	{
		name: "輪ゴム",
		danger: 15,
		deathReason: "輪ゴムが胃で絡まった",
	},
	{
		name: "粘土",
		danger: 32,
		deathReason: "粘土が胃で固まった",
	},
	{
		name: "乾電池",
		danger: 65,
		deathReason: "乾電池の中身が漏れた",
	},
	{
		name: "蛍光ペン",
		danger: 42,
		deathReason: "インクを大量摂取した",
	},
	{
		name: "発泡スチロール",
		danger: 33,
		deathReason: "発泡スチロールが喉に詰まった",
	},
	{
		name: "プラスチックスプーン",
		danger: 30,
		deathReason: "スプーンの破片が刺さった",
	},
	{
		name: "プラスチックフォーク",
		danger: 35,
		deathReason: "フォークを噛み砕こうとした",
	},
	{
		name: "ストロー",
		danger: 18,
		deathReason: "ストローが気管に入った",
	},
	{
		name: "割り箸",
		danger: 21,
		deathReason: "割り箸の破片が刺さった",
	},
	{
		name: "爪楊枝",
		danger: 30,
		deathReason: "爪楊枝が喉に刺さった",
	},
	{
		name: "ヘアゴム",
		danger: 27,
		deathReason: "ヘアゴムが胃で絡まった",
	},
	{
		name: "セロハンテープ",
		danger: 27,
		deathReason: "口が塞がった",
	},
	{
		name: "ガムテープ",
		danger: 35,
		deathReason: "ガムテープが消化できなかった",
	},
	{
		name: "接着剤",
		danger: 47,
		deathReason: "接着剤で内臓が固まった",
	},
	{
		name: "洗濯のり",
		danger: 48,
		deathReason: "胃の中がベタベタになった",
	},
	{
		name: "石鹸",
		danger: 34,
		deathReason: "泡で呼吸できなくなった",
	},
	{
		name: "シャンプー",
		danger: 31,
		deathReason: "シャンプーを飲みすぎた",
	},
	{
		name: "ボディソープ",
		danger: 23,
		deathReason: "胃が泡だらけになった",
	},
	{
		name: "歯磨き粉",
		danger: 10,
		deathReason: "歯磨き粉を大量摂取した",
	},
	{
		name: "口紅",
		danger: 14,
		deathReason: "口紅を一本丸ごと食べた",
	},
	{
		name: "シャーペンの芯",
		danger: 12,
		deathReason: "シャーペンの芯が刺さった",
	},
	{
		name: "シャーペン",
		danger: 11,
		deathReason: "シャーペンを食べ続けた",
	},
	{
		name: "カニ",
		danger: 26,
		deathReason: "カニを食べすぎた",
	},
	{
		name: "ワイン",
		danger: 17,
		deathReason: "ワインを飲み干した",
	},
	{
		name: "フライパン",
		danger: 44,
		deathReason: "フライパンが喉に詰まった",
	},
	{
		name: "人形",
		danger: 37,
		deathReason: "人形を大量摂取した",
	},
	{
		name: "教科書",
		danger: 26,
		deathReason: "紙が喉に詰まった",
	},
	{
		name: "消しゴムのカス",
		danger: 11,
		deathReason: "消しゴムのカスが気管に入った",
	},
	{
		name: "カッター",
		danger: 40,
		deathReason: "カッターが喉を突き破った",
	},
	{
		name: "おはじき",
		danger: 32,
		deathReason: "おはじきを飲み込んだ",
	},
	{
		name: "スーパーボール",
		danger: 38,
		deathReason: "スーパーボールが喉に詰まった",
	},
	{
		name: "粘土",
		danger: 48,
		deathReason: "粘土が胃で固まった",
	},
	{
		name: "紙粘土",
		danger: 38,
		deathReason: "紙粘土が膨張した",
	},
	{
		name: "木炭",
		danger: 42,
		deathReason: "木炭を大量に食べた",
	},
	{
		name: "木片",
		danger: 22,
		deathReason: "木片が刺さった",
	},
	{
		name: "落ち葉",
		danger: 16,
		deathReason: "落ち葉を食べすぎた",
	},
	{
		name: "芝生",
		danger: 13,
		deathReason: "芝生が消化できなかった",
	},
	{
		name: "観葉植物",
		danger: 15,
		deathReason: "観葉植物に反撃された",
	},
	{
		name: "花びら",
		danger: 10,
		deathReason: "花びらを喉に詰まらせた",
	},
	{
		name: "松ぼっくり",
		danger: 35,
		deathReason: "松ぼっくりを丸飲みした",
	},
	{
		name: "どんぐり",
		danger: 23,
		deathReason: "どんぐりが喉に詰まった",
	},
	{
		name: "小石",
		danger: 25,
		deathReason: "小石で歯が砕けた",
	},
	{
		name: "砂",
		danger: 31,
		deathReason: "砂を大量に吸い込んだ",
	},
	{
		name: "泥団子",
		danger: 29,
		deathReason: "泥団子を食べた",
	},
	{
		name: "レンガの欠片",
		danger: 64,
		deathReason: "レンガの破片で口の中が傷だらけになった",
	},

	// 71～80

	{
		name: "自転車",
		danger: 71,
		deathReason: "自転車を食べようとして顎が壊れた",
	},
	{
		name: "原付",
		danger: 72,
		deathReason: "原付を食べようとして潰された",
	},
	{
		name: "バイク",
		danger: 73,
		deathReason: "バイクを飲み込もうとした",
	},
	{
		name: "軽自動車",
		danger: 74,
		deathReason: "軽自動車を食べるのは無理だった",
	},
	{
		name: "普通車",
		danger: 75,
		deathReason: "車を噛んだ瞬間に敗北した",
	},
	{
		name: "トラック",
		danger: 76,
		deathReason: "トラックに返り討ちにされた",
	},
	{
		name: "電車",
		danger: 77,
		deathReason: "電車を食べようとした結果だった",
	},
	{
		name: "冷蔵庫",
		danger: 78,
		deathReason: "冷蔵庫が大きすぎた",
	},
	{
		name: "洗濯機",
		danger: 79,
		deathReason: "洗濯機を食べる前に力尽きた",
	},
	{
		name: "一戸建て住宅",
		danger: 80,
		deathReason: "家は食べ物ではなかった",
	},
];

function randomFood() {
	return foods[Math.floor(Math.random() * foods.length)];
}

function calculateHungerIncrease() {
	return (Math.floor(Math.random() * 3) + 1) * 10;
}

function calculateHpIncrease() {
	return (Math.floor(Math.random() * 3) + 1) * 10;
}

function createEmbed(state: GameState) {
	const embed = new EmbedBuilder()
		.setTitle(`${state.day}日目`)
		.setDescription(
			[
				`## ${state.currentFood.name}`,
				"",
				state.mustEat ? "⚠️ **食べないと死んでしまう！**" : "",
				`危険度: ${state.currentFood.danger}%`,
				"",
				`🍖 おなか: ${state.hunger}`,
				`❤️ 体力: ${state.hp}`,
			].join("\n"),
		);

	if (state.currentFood.image) {
		embed.setImage(state.currentFood.image);
	}

	return embed;
}

function createButtons(state: GameState) {
	return [
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("eat")
				.setLabel("🍴 食べる")
				.setStyle(ButtonStyle.Success),

			new ButtonBuilder()
				.setCustomId("skip")
				.setLabel("❌ 食べない")
				.setDisabled(state.mustEat)
				.setStyle(ButtonStyle.Danger),
		),
	];
}

export const data = new SlashCommandBuilder()
	.setName("survival")
	.setDescription("サバイバルゲーム開始");

export async function execute(interaction: ChatInputCommandInteraction) {
	const state: GameState = {
		day: 1,
		hunger: 50,
		hp: 100,
		currentFood: randomFood(),
		mustEat: false,
	};

	const message = await interaction.reply({
		embeds: [createEmbed(state)],
		components: createButtons(state),
		fetchReply: true,
	});

	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		time: 10 * 60 * 1000,
	});

	collector.on("collect", async (button) => {
		if (button.user.id !== interaction.user.id) {
			await button.reply({
				content: "あなたのゲームではありません。",
				ephemeral: true,
			});
			return;
		}

		if (button.customId === "eat") {
			const roll = Math.random() * 100;

			if (roll < state.currentFood.danger) {
				collector.stop();
				await button.deferUpdate();
				const currentRecord = await prisma.survivalRanking.findUnique({
					where: { userId: interaction.user.id },
				});

				await prisma.survivalRanking.upsert({
					where: {
						userId: interaction.user.id,
					},
					update: {
						bestDays: Math.max(currentRecord?.bestDays ?? 0, state.day),
					},
					create: {
						userId: interaction.user.id,
						username: interaction.user.username,
						bestDays: state.day,
					},
				});
				const rankings = await prisma.survivalRanking.findMany({
					orderBy: {
						bestDays: "desc",
					},
					take: 10,
				});
				await button.editReply({
					embeds: [
						new EmbedBuilder()
							.setTitle("💀 GAME OVER")
							.setDescription(
								[
									`生存日数: ${state.day}`,
									"",
									`死因: ${state.currentFood.deathReason}`,
									`\n\n🏆ランキング🏆\n${rankings.map((r, i) => `${i + 1}. ${r.username} - ${r.bestDays}日`).join("\n")}`,
								].join("\n"),
							),
					],
					components: [],
				});

				return;
			}

			const hungerIncrease = calculateHungerIncrease();
			const hpIncrease = calculateHpIncrease();

			state.hunger = Math.min(state.hunger + hungerIncrease);
			state.hp = Math.min(state.hp + hpIncrease);
		}

		if (button.customId === "skip") {
			if (state.mustEat) {
				collector.stop();

				await button.deferUpdate();
				await button.editReply({
					embeds: [
						new EmbedBuilder()
							.setTitle("💀 GAME OVER")
							.setDescription(
								[
									`生存日数: ${state.day}`,
									"",
									state.hunger === 0 ? "死因: 餓死" : "死因: 体力切れ",
								].join("\n"),
							),
					],
					components: [],
				});

				return;
			}

			state.hunger -= 40;
			state.hp -= 40;
		}

		state.hunger = Math.max(0, state.hunger);
		state.hp = Math.max(0, state.hp);

		state.mustEat = state.hunger === 0 || state.hp === 0;

		state.day++;

		if (!state.mustEat) {
			const eventRoll = Math.random();

			if (eventRoll < 0.15) {
				state.hunger = Math.min(100, state.hunger + 50);
			} else if (eventRoll < 0.2) {
				state.hunger = Math.max(0, state.hunger - 30);
			}
		}

		state.currentFood = randomFood();

		await button.deferUpdate();
		await button.editReply({
			embeds: [createEmbed(state)],
			components: createButtons(state),
		});
	});
}
