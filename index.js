const fs = require("fs");
const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
require("dotenv").config();
const express = require("express");

const app = express();
const PORT = process.env.PORT || 20419;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

/* =========================
   Web Server
========================= */

app.use(express.static("public"));

app.get("/api/status", (req, res) => {
  res.json({
    status: "online",
    bot: client.user ? client.user.tag : "starting..."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("==================================");
  console.log("🌐 Web Server Started");
  console.log(`👉 http://0.0.0.0:${PORT}`);
  console.log("==================================");
});

// =======================
// コマンド登録（指定方式）
// =======================
client.commands = new Collection();

const commandFiles = fs
  .readdirSync("./commands")
  .filter(file => file.endsWith(".js"))
  .sort();

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);

  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`⚠️ ${file} は data または execute が不足しています`);
  }
}

// =======================
// イベント登録
// =======================
const eventFiles = fs
  .readdirSync("./events")
  .filter(file => file.endsWith(".js"))
  .sort();

for (const file of eventFiles) {
  const event = require(`./events/${file}`);

  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// =======================
// ログイン
// =======================
client.login(process.env.DISCORD_BOT_TOKEN);
