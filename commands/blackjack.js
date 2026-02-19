const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { getUserEconomy, addBalance } = require("../utils/economy");

function drawCard() {
  const cards = [
    { label: "A", value: 11 },
    { label: "2", value: 2 },
    { label: "3", value: 3 },
    { label: "4", value: 4 },
    { label: "5", value: 5 },
    { label: "6", value: 6 },
    { label: "7", value: 7 },
    { label: "8", value: 8 },
    { label: "9", value: 9 },
    { label: "10", value: 10 },
    { label: "J", value: 10 },
    { label: "Q", value: 10 },
    { label: "K", value: 10 },
  ];

  return cards[Math.floor(Math.random() * cards.length)];
}

function getHandTotal(hand) {
  let total = hand.reduce((sum, card) => sum + card.value, 0);
  let aceCount = hand.filter((card) => card.label === "A").length;

  while (total > 21 && aceCount > 0) {
    total -= 10;
    aceCount -= 1;
  }

  return total;
}

function formatHand(hand) {
  return hand.map((card) => card.label).join(" ");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("ブラックジャックで賭けをします")
    .addStringOption((option) =>
      option
        .setName("bet")
        .setDescription("賭け金（数値 / all / half）")
        .setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const betInput = interaction.options.getString("bet", true).trim().toLowerCase();
    const economy = getUserEconomy(userId);

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

    const playerHand = [drawCard(), drawCard()];
    const dealerHand = [drawCard(), drawCard()];

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("bj_hit").setLabel("Hit").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("bj_stand").setLabel("Stand").setStyle(ButtonStyle.Secondary)
    );

    const buildEmbed = (revealDealer = false) => {
      const playerTotal = getHandTotal(playerHand);
      const dealerTotal = getHandTotal(dealerHand);

      return new EmbedBuilder()
        .setColor("DarkBlue")
        .setTitle("🃏 ブラックジャック")
        .addFields(
          {
            name: "あなたの手札",
            value: `${formatHand(playerHand)} (合計: **${playerTotal}**)`,
          },
          {
            name: "ディーラーの手札",
            value: revealDealer
              ? `${formatHand(dealerHand)} (合計: **${dealerTotal}**)`
              : `${dealerHand[0].label} ?`,
          },
          {
            name: "賭け金",
            value: `**${bet}円**`,
          }
        );
    };

    const settle = async (resultText, delta, revealDealer = true) => {
      const updated = addBalance(userId, delta);
      const color = delta > 0 ? "Green" : delta < 0 ? "Red" : "Yellow";

      const embed = buildEmbed(revealDealer)
        .setColor(color)
        .setFooter({ text: `${resultText} | 現在の所持金: ${updated.balance}円` });

      await interaction.editReply({ embeds: [embed], components: [] });
    };

    const playerTotal = getHandTotal(playerHand);
    const dealerTotal = getHandTotal(dealerHand);

    await interaction.reply({ embeds: [buildEmbed(false)], components: [row] });
    const message = await interaction.fetchReply();

    if (playerTotal === 21 || dealerTotal === 21) {
      if (playerTotal === 21 && dealerTotal === 21) {
        return settle("引き分け", 0);
      }
      if (playerTotal === 21) {
        const payout = Math.max(1, Math.floor(bet * 1.5));
        return settle("ブラックジャック！勝利", payout);
      }
      return settle("ディーラーブラックジャック…敗北", -bet);
    }

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
    });

    collector.on("collect", async (buttonInteraction) => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        return buttonInteraction.reply({ content: "このゲームには参加できません。", ephemeral: true });
      }

      if (buttonInteraction.customId === "bj_hit") {
        playerHand.push(drawCard());
        const total = getHandTotal(playerHand);

        if (total > 21) {
          collector.stop("player_bust");
          await buttonInteraction.deferUpdate();
          return settle("バースト！敗北", -bet);
        }

        return buttonInteraction.update({ embeds: [buildEmbed(false)], components: [row] });
      }

      if (buttonInteraction.customId === "bj_stand") {
        await buttonInteraction.deferUpdate();
        collector.stop("stand");

        while (getHandTotal(dealerHand) < 17) {
          dealerHand.push(drawCard());
        }

        const finalPlayer = getHandTotal(playerHand);
        const finalDealer = getHandTotal(dealerHand);

        if (finalDealer > 21 || finalPlayer > finalDealer) {
          return settle("勝利！", bet);
        }

        if (finalPlayer < finalDealer) {
          return settle("敗北…", -bet);
        }

        return settle("引き分け", 0);
      }
    });

    collector.on("end", async (_collected, reason) => {
      if (reason === "time") {
        const embed = buildEmbed(false)
          .setColor("Orange")
          .setFooter({ text: "時間切れでゲーム終了しました（所持金の変動なし）" });

        await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
      }
    });
  },
};
