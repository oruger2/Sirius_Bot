const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { getUserEconomy, addBalance } = require("../utils/economy");
const { isUserPlayingAnyGame, setUserPlayingHighLow } = require("../utils/gameState");

function drawNumber() {
  return Math.floor(Math.random() * 13) + 1;
}

function formatCard(num) {
  if (num === 1) return "A";
  if (num === 11) return "J";
  if (num === 12) return "Q";
  if (num === 13) return "K";
  return `${num}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("highlow")
    .setDescription("ハイアンドローで賭けをします")
    .addStringOption((option) =>
      option
        .setName("bet")
        .setDescription("賭け金（数値 / all / half）")
        .setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;

    const isPlaying = await isUserPlayingAnyGame(userId);
    if (isPlaying) {
      return interaction.reply({
        content: "❌ 既に他のゲームをプレイ中です。進行中のゲームを完了してからもう一度お試しください。",
        ephemeral: true,
      });
    }

    const betInput = interaction.options.getString("bet", true).trim().toLowerCase();
    const economy = await getUserEconomy(userId);

    let bet;

    if (betInput === "all") {
      bet = economy.balance;
    } else if (betInput === "half") {
      bet = Math.floor(economy.balance / 2);
    } else {
      bet = Number.parseInt(betInput, 10);
    }

    if (!Number.isInteger(bet) || bet < 1) {
      return interaction.reply({
        content: "❌ 賭け金は **1以上の数値** か **all / half** を指定してください。",
        ephemeral: true,
      });
    }

    if (economy.balance < bet) {
      return interaction.reply(`❌ 所持金が足りません。現在 **${economy.balance}円** です。`);
    }

    await setUserPlayingHighLow(userId, true);

    const openCard = drawNumber();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("hl_high").setLabel("High").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("hl_low").setLabel("Low").setStyle(ButtonStyle.Secondary)
    );

    const buildEmbed = (resultText = null, nextCard = null, color = "DarkBlue") => {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("📈 ハイアンドロー")
        .addFields(
          { name: "公開カード", value: `**${formatCard(openCard)}**` },
          { name: "賭け金", value: `**${bet}円**` }
        );

      if (nextCard !== null) {
        embed.addFields({ name: "次のカード", value: `**${formatCard(nextCard)}**` });
      }

      if (resultText) {
        embed.setFooter({ text: resultText });
      }

      return embed;
    };

    const settle = async (resultText, delta, nextCard, color) => {
      const updated = await addBalance(userId, delta);
      const embed = buildEmbed(
        `${resultText} | 現在の所持金: ${updated.balance}円`,
        nextCard,
        color
      );

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed], components: [] });
      } else {
        await interaction.reply({ embeds: [embed], components: [] });
      }

      await setUserPlayingHighLow(userId, false);
    };

    await interaction.reply({ embeds: [buildEmbed()], components: [row] });
    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
    });

    collector.on("collect", async (buttonInteraction) => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        return buttonInteraction.reply({ content: "このゲームには参加できません。", ephemeral: true });
      }

      const nextCard = drawNumber();
      const userPick = buttonInteraction.customId;

      let delta = 0;
      let resultText = "引き分け";
      let color = "Yellow";

      if (nextCard === openCard) {
        delta = 0;
        resultText = "同じ数字！引き分け";
      } else if (userPick === "hl_high") {
        if (nextCard > openCard) {
          delta = Math.round(bet*0.5);
          resultText = "勝利！";
          color = "Green";
        } else {
          delta = -bet;
          resultText = "敗北…";
          color = "Red";
        }
      } else if (userPick === "hl_low") {
        if (nextCard < openCard) {
          delta = Math.round(bet*0.5);
          resultText = "勝利！";
          color = "Green";
        } else {
          delta = -bet;
          resultText = "敗北…";
          color = "Red";
        }
      }

      collector.stop("finished");
      await buttonInteraction.deferUpdate();
      await settle(resultText, delta, nextCard, color);
    });

    collector.on("end", async (_collected, reason) => {
      if (reason === "time") {
        const embed = buildEmbed("時間切れでゲーム終了しました（所持金の変動なし）", null, "Orange");
        await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
        await setUserPlayingHighLow(userId, false);
      }
    });
  },
};
