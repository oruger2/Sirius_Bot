const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const path = require("path");
const fsp = require("fs/promises");
const {
  addBalance,
  setBalance,
  getUserEconomy,
} = require("../utils/economy");

const adminPath = path.join(__dirname, "../json/admin.json");
const blacklistPath = path.join(__dirname, "../json/blacklist.json");
const stopConfigPath = path.join(__dirname, "../json/config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("管理者専用のコマンドです")
    .addSubcommand((sub) =>
      sub
        .setName("server")
        .setDescription("ボットが参加中のサーバーを表示します")
    )
    .addSubcommand((sub) =>
      sub
        .setName("leave")
        .setDescription("指定されたサーバーからボットを退出させます")
        .addStringOption((opt) =>
          opt
            .setName("server_id")
            .setDescription("サーバーID")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("invite")
        .setDescription("指定されたサーバーの招待リンクを生成します")
        .addStringOption((opt) =>
          opt
            .setName("server_id")
            .setDescription("サーバーID")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("member")
        .setDescription("Bot管理者を追加します")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("管理者として追加するユーザー")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("money")
        .setDescription("ユーザーの所持金を操作します")
        .addStringOption((opt) =>
          opt
            .setName("action")
            .setDescription("所持金の操作")
            .setRequired(true)
            .addChoices(
              { name: "追加", value: "add" },
              { name: "減量", value: "remove" },
              { name: "設定", value: "set" }
            )
        )
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("対象ユーザー")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("金額")
            .setRequired(true)
            .setMinValue(0)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("stop")
        .setDescription("指定コマンドを停止中リストへ追加します")
        .addStringOption((opt) =>
          opt
            .setName("command")
            .setDescription("停止するコマンド名（例: money または /money）")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("blacklist")
        .setDescription("ユーザーまたはサーバーをブラックリストに登録します")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("登録タイプ")
            .setRequired(true)
            .addChoices(
              { name: "ユーザー", value: "user" },
              { name: "サーバー", value: "server" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("id")
            .setDescription("ユーザーID または サーバーID")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    let admin;
    let blacklist;

    try {
      admin = JSON.parse(await fsp.readFile(adminPath, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") {
        admin = { users: [] };
      } else {
        console.error("Failed to read or parse admin config:", err);
        throw err;
      }
    }

    try {
      blacklist = JSON.parse(await fsp.readFile(blacklistPath, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") {
        blacklist = { users: [], servers: [] };
      } else {
        console.error("Failed to read or parse blacklist config:", err);
        throw err;
      }
    }

    // ===== 管理者チェック =====
    if (!admin.users.includes(interaction.user.id)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("❌ 権限エラー")
            .setDescription("このコマンドは **Bot管理者専用** です。"),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();

    // ===== /admin server =====
    if (sub === "server") {
      const servers = interaction.client.guilds.cache
        .map((g) => `• ${g.name} (${g.id})`)
        .join("\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Blue")
            .setTitle("📊 参加中サーバー一覧")
            .setDescription(servers || "参加しているサーバーはありません"),
        ],
        flags: MessageFlags.Ephemeral,
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
              .setDescription("指定されたサーバーが見つかりません。"),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      await guild.leave();

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Orange")
            .setTitle("🚪 サーバー退出")
            .setDescription(`**${guild.name}** から退出しました。`),
        ],
        flags: MessageFlags.Ephemeral,
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
              .setDescription("指定されたサーバーが見つかりません。"),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const channel = guild.channels.cache.find(
        (c) =>
          c.isTextBased() &&
          c.permissionsFor(guild.members.me).has("CreateInstantInvite")
      );

      if (!channel) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle("❌ エラー")
              .setDescription("招待リンクを作成できるチャンネルがありません。"),
          ],
          flags: MessageFlags.Ephemeral,
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
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ===== /admin member =====
    if (sub === "member") {
      const user = interaction.options.getUser("user");

      if (admin.users.includes(user.id)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Yellow")
              .setTitle("⚠️ 既に登録済み")
              .setDescription(`${user.tag} は既に管理者です。`),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      admin.users.push(user.id);
      await fsp.writeFile(adminPath, JSON.stringify(admin, null, 2));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Green")
            .setTitle("✅ 管理者追加")
            .setDescription(`${user.tag} を **Bot管理者** に追加しました。`),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ===== /admin money =====
    if (sub === "money") {
      const action = interaction.options.getString("action", true);
      const user = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("amount", true);
      const signedAmount = action === "remove" ? -amount : amount;

      if (action === "set") {
        await setBalance(user.id, amount, user.username);
      } else {
        await addBalance(user.id, signedAmount, user.username);
      }

      const updated = await getUserEconomy(user.id);
      const actionLabel =
        action === "add" ? "追加" : action === "remove" ? "減量" : "設定";

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Green")
            .setTitle("💰 所持金を更新しました")
            .addFields(
              { name: "対象", value: `${user.tag} (${user.id})` },
              { name: "操作", value: actionLabel, inline: true },
              { name: "金額", value: `${amount}円`, inline: true },
              { name: "現在の所持金", value: `${updated.balance}円` }
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ===== /admin stop =====
    if (sub === "stop") {
      const input = interaction.options.getString("command", true);
      const command = input.replace(/^\//, "").trim().toLowerCase();

      if (!command) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle("❌ エラー")
              .setDescription("停止するコマンド名を正しく入力してください。"),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      let confg = { stopping: [] };

      try {
        const raw = await fsp.readFile(stopConfigPath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          confg = {
            ...parsed,
            stopping: Array.isArray(parsed.stopping) ? parsed.stopping : [],
          };
        }
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("Failed to read or parse confg config:", error);
          throw error;
        }
      }

      const normalizedStopping = confg.stopping
        .map((name) => String(name).replace(/^\//, "").trim().toLowerCase())
        .filter(Boolean);

      if (normalizedStopping.includes(command)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Yellow")
              .setTitle("⚠️ 既に停止中")
              .setDescription(`/${command} は既に停止中です。`),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      normalizedStopping.push(command);
      confg.stopping = normalizedStopping;
      await fsp.writeFile(stopConfigPath, JSON.stringify(confg, null, 2), "utf8");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Orange")
            .setTitle("⛔ コマンド停止")
            .setDescription(`/${command} を停止コマンドに追加しました。`),
        ],
        flags: MessageFlags.Ephemeral,
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
                .setDescription(
                  "このユーザーは既にブラックリストに登録されています。"
                ),
            ],
            flags: MessageFlags.Ephemeral,
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
                .setDescription(
                  "このサーバーは既にブラックリストに登録されています。"
                ),
            ],
            flags: MessageFlags.Ephemeral,
          });
        }

        blacklist.servers.push(id);
      }

      await fsp.writeFile(blacklistPath, JSON.stringify(blacklist, null, 2));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("DarkRed")
            .setTitle("🚫 ブラックリスト登録")
            .addFields(
              {
                name: "タイプ",
                value: type === "user" ? "ユーザー" : "サーバー",
                inline: true,
              },
              { name: "ID", value: id, inline: true }
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
