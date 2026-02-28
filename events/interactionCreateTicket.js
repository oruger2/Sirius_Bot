const fsp = require("fs/promises");
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");

const DATA_PATH = path.join(__dirname, "../json/tickets.json");

async function loadTickets() {
  try {
    const raw = await fsp.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function saveTickets(data) {
  await fsp.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fsp.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
}

function sanitizeChannelName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-ぁ-んァ-ヶー一-龠]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
}

function buildControls(locked) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:close")
      .setLabel("閉じる")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️"),
    locked
      ? new ButtonBuilder()
          .setCustomId("ticket:reopen")
          .setLabel("リオープン")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🔓")
      : new ButtonBuilder()
          .setCustomId("ticket:lock")
          .setLabel("ロック")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("🔒")
  );
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("ticket:")) return;
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "❌ サーバー内でのみ使用できます。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const [namespace, action, arg1, arg2] = interaction.customId.split(":");
    if (namespace !== "ticket") return;

    if (action === "create") {
      const categoryId = arg1;
      const staffId = arg2;

      const category = interaction.guild.channels.cache.get(categoryId);
      if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.reply({
          content: "❌ 設定されたカテゴリが見つかりません。",
          flags: MessageFlags.Ephemeral,
        });
      }

      const me = interaction.guild.members.me;
      if (!me || !category.permissionsFor(me).has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          content: "❌ Botにカテゴリ内でチャンネルを作成する権限がありません。",
          flags: MessageFlags.Ephemeral,
        });
      }

      const tickets = await loadTickets();
      const hasOpenTicket = Object.entries(tickets).some(([, ticket]) => (
        ticket.guildId === interaction.guildId &&
        ticket.creatorId === interaction.user.id &&
        ticket.categoryId === categoryId &&
        ticket.closed !== true
      ));

      if (hasOpenTicket) {
        return interaction.reply({
          content: "⚠️ すでにこのカテゴリで開いているチケットがあります。",
          flags: MessageFlags.Ephemeral,
        });
      }

      const baseName = sanitizeChannelName(`ticket-${interaction.user.username}`) || `ticket-${interaction.user.id.slice(-4)}`;
      const channelName = `${baseName}-${interaction.user.id.slice(-4)}`;

      const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
            ],
          },
          {
            id: staffId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
            ],
          },
          {
            id: me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ],
      });

      tickets[channel.id] = {
        guildId: interaction.guildId,
        categoryId,
        creatorId: interaction.user.id,
        staffId,
        locked: false,
        closed: false,
      };
      await saveTickets(tickets);

      await channel.send({
        content: `<@${interaction.user.id}> <@${staffId}>`,
        components: [buildControls(false)],
      });

      return interaction.reply({
        content: `✅ チケットを作成しました: ${channel}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const tickets = await loadTickets();
    const ticket = tickets[interaction.channelId];

    if (!ticket || ticket.guildId !== interaction.guildId || ticket.closed) {
      return interaction.reply({
        content: "❌ このチャンネルは管理対象のチケットではありません。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const isStaff = interaction.user.id === ticket.staffId;
    const isManager = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

    if (!isStaff && !isManager) {
      return interaction.reply({
        content: "❌ 対応者またはチャンネル管理者のみ操作できます。",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === "close") {
      tickets[interaction.channelId].closed = true;
      await saveTickets(tickets);

      await interaction.reply({
        content: "🗑️ チケットを閉じます...",
        flags: MessageFlags.Ephemeral,
      });

      await interaction.channel.delete("Ticket closed");
      return;
    }

    if (action === "lock") {
      if (ticket.locked) {
        return interaction.reply({
          content: "⚠️ すでにロックされています。",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.channel.permissionOverwrites.edit(ticket.creatorId, {
        ViewChannel: false,
      });

      tickets[interaction.channelId].locked = true;
      await saveTickets(tickets);

      return interaction.update({ components: [buildControls(true)] });
    }

    if (action === "reopen") {
      if (!ticket.locked) {
        return interaction.reply({
          content: "⚠️ このチケットはロックされていません。",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.channel.permissionOverwrites.edit(ticket.creatorId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      tickets[interaction.channelId].locked = false;
      await saveTickets(tickets);

      return interaction.update({ components: [buildControls(false)] });
    }
  },
};
