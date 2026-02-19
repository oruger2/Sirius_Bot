const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");

const commandsData = require("../json/commands.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("コマンド一覧を表示します"),

  async execute(interaction) {
    const categories = Object.keys(commandsData);
    let page = 0;

    const buildEmbed = (pageIndex) => {
      const categoryName = categories[pageIndex];
      const commands = commandsData[categoryName];

      const embed = new EmbedBuilder()
        .setTitle(`📖 Help - ${categoryName}`)
        .setColor("Blue");

      commands.forEach((cmd) => {
        let value = `**説明:** ${cmd.description}\n`;

        if (cmd.permission) {
          if (cmd.permission === "BOT_OWNER") {
            value += `**必要権限:** 👑 Bot製作者のみ\n`;
          } else {
            value += `**必要権限:** ${cmd.permission}\n`;
          }
        }

        // サブコマンド表示
        if (cmd.subcommands && cmd.subcommands.length > 0) {
          value += `\n**サブコマンド:**\n`;
          cmd.subcommands.forEach((sub) => {
            value += `・\`/${cmd.name} ${sub.name}\` - ${sub.description}\n`;
          });
        }

        embed.addFields({
          name: `/${cmd.name}`,
          value: value,
        });
      });

      embed.setFooter({
        text: `ページ ${pageIndex + 1} / ${categories.length}`,
      });

      return embed;
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prev")
        .setLabel("◀")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("next")
        .setLabel("▶")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      embeds: [buildEmbed(page)],
      components: [row],
    });

    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply({
          content: "このボタンはあなたは使えません。",
          flags: 64,
        });
      }

      if (btn.customId === "prev") {
        page = page > 0 ? --page : categories.length - 1;
      }

      if (btn.customId === "next") {
        page = page < categories.length - 1 ? ++page : 0;
      }

      await btn.update({
        embeds: [buildEmbed(page)],
      });
    });

    collector.on("end", async () => {
      await message.edit({ components: [] }).catch(() => {});
    });
  },
};
