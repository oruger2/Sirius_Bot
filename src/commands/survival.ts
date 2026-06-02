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
]
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

export async function execute(
  interaction: ChatInputCommandInteraction,
) {
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

        await button.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("💀 GAME OVER")
              .setDescription(
                [
                  `生存日数: ${state.day}`,
                  "",
                  `死因: ${state.currentFood.deathReason}`,
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

        await button.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("💀 GAME OVER")
              .setDescription(
                [
                  `生存日数: ${state.day}`,
                  "",
                  state.hunger === 0
                    ? "死因: 餓死"
                    : "死因: 体力切れ",
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
        state.hunger = Math.min(
          100,
          state.hunger + 50,
        );
      } else if (eventRoll < 0.2) {
        state.hunger = Math.max(
          0,
          state.hunger - 30,
        );
      }
    }

    state.currentFood = randomFood();

    await button.update({
      embeds: [createEmbed(state)],
      components: createButtons(state),
    });
  });
}