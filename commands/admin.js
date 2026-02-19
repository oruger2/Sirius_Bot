const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const path = require("path");
const fs = require("fs");

const adminPath = "./json/admin.json";
const blacklistPath = "./json/blacklist.json";

const admin = JSON.parse(fs.readFileSync(adminPath, "utf8"));
const blacklist = JSON.parse(fs.readFileSync(blacklistPath, "utf8"));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("管理者専用のコマンドです")
    .addSubcommand(sub =>
      sub
        .setName("server")
        .setDescription("ボットが参加中のサーバーを表示します")
    )
    .addSubcommand(sub =>
      sub
        .setName("leave")
        .setDescription("指定されたサーバーからボットを退出させます")
        .addStringOption(opt =>
          opt
            .setName("server_id")
            .setDescription("サーバーID")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("invite")
        .setDescription("指定されたサーバーの招待リンクを生成します")
        .addStringOption(opt =>
          opt
            .setName("server_id")
            .setDescription("サーバーID")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("member")
        .setDescription("Bot管理者を追加します")
        .addUserOption(opt =>
          opt
            .setName("user")
            .setDescription("管理者として追加するユーザー")
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName("blacklist")
        .setDescription("ユーザーまたはサーバーをブラックリストに登録します")
        .addStringOption(opt =>
          opt
            .setName("type")
            .setDescription("登録タイプ")
            .setRequired(true)
            .addChoices(
              { name: "ユーザー", value: "user" },
              { name: "サーバー", value: "server" }
            )
        )
        .addStringOption(opt =>
          opt
            .setName("id")
            .setDescription("ユーザーID または サーバーID")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    // ===== 管理者チェック =====
    if (!admin.users.includes(interaction.user.id)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("❌ 権限エラー")
            .setDescription("このコマンドは **Bot管理者専用** です。")
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const sub = interaction.options.getSubcommand();

    // ===== /admin server =====
    if (sub === "server") {
      const servers = interaction.client.guilds.cache
        .map(g => `• ${g.name} (${g.id})`)
        .join("\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Blue")
            .setTitle("📊 参加中サーバー一覧")
            .setDescription(servers || "参加しているサーバーはありません")
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    // ===== /admin leave =====
    if (sub === "leave") {
      const serverId = interaction.options.getString("server_id");
      const guild = interaction.client.guilds.cache.get(serverId);

      if (!guild) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle("❌ エラー")
              .setDescription("指定されたサーバーが見つかりません。")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      await guild.leave();

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Orange")
            .setTitle("🚪 サーバー退出")
            .setDescription(`**${guild.name}** から退出しました。`)
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    // ===== /admin invite =====
    if (sub === "invite") {
      const serverId = interaction.options.getString("server_id");
      const guild = interaction.client.guilds.cache.get(serverId);

      if (!guild) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle("❌ エラー")
              .setDescription("指定されたサーバーが見つかりません。")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const channel = guild.channels.cache.find(
        c => c.isTextBased() && c.permissionsFor(guild.members.me).has("CreateInstantInvite")
      );

      if (!channel) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle("❌ エラー")
              .setDescription("招待リンクを作成できるチャンネルがありません。")
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const invite = await channel.createInvite({
        maxAge: 0,
        maxUses: 0,
      });

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Green")
            .setTitle("🔗 招待リンク生成")
            .addFields(
              { name: "サーバー", value: guild.name },
              { name: "URL", value: invite.url }
            )
        ],
        flags: MessageFlags.Ephemeral
      });
    }
    
    // ===== /admin member =====
    if (sub === "member") {
      const user = interaction.options.getUser("user");

      if (admins.admins.includes(user.id)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Yellow")
              .setTitle("⚠️ 既に登録済み")
              .setDescription(`${user.tag} は既に管理者です。`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      admins.admins.push(user.id);
      fs.writeFileSync(adminPath, JSON.stringify(admins, null, 2));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Green")
            .setTitle("✅ 管理者追加")
            .setDescription(`${user.tag} を **Bot管理者** に追加しました。`)
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    // ===== /admin blacklist =====
    if (sub === "blacklist") {
      const type = interaction.options.getString("type");
      const id = interaction.options.getString("id");

      if (type === "user") {
        if (blacklist.users.includes(id)) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor("Yellow")
                .setTitle("⚠️ 既に登録済み")
                .setDescription("このユーザーは既にブラックリストに登録されています。")
            ],
            flags: MessageFlags.Ephemeral
          });
        }

        blacklist.users.push(id);
      }

      if (type === "server") {
        if (blacklist.servers.includes(id)) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor("Yellow")
                .setTitle("⚠️ 既に登録済み")
                .setDescription("このサーバーは既にブラックリストに登録されています。")
            ],
            flags: MessageFlags.Ephemeral
          });
        }

        blacklist.servers.push(id);
      }

      fs.writeFileSync(blacklistPath, JSON.stringify(blacklist, null, 2));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("DarkRed")
            .setTitle("🚫 ブラックリスト登録")
            .addFields(
              { name: "タイプ", value: type === "user" ? "ユーザー" : "サーバー", inline: true },
              { name: "ID", value: id, inline: true }
            )
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
