const { getGuildShortLinkSetting } = require("../utils/shortLinkBlockSettings");

const shortLinkDomains = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "is.gd",
  "goo.gl",
  "ow.ly",
  "buff.ly",
  "adf.ly",
  "shorte.st",
  "cutt.ly",
  "i8.ae",
];
const allowedDomains = ["chatgpt.com", "bot.com"];

module.exports = {
  name: "messageCreate",

  async execute(message) {
    if (!message.guild || message.author.bot) return;

    const setting = getGuildShortLinkSetting(message.guild.id);
    if (!setting.enabled) return;

    const rawUrls = message.content.match(/https?:\/\/[^\s]+|(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\^\s]*)?/gi);
    if (!rawUrls) return;

    const hosts = rawUrls
      .map((rawUrl) => {
        const cleaned = rawUrl.replace(/[)>.,!?]+$/g, "");
        const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

        try {
          return new URL(withProtocol).hostname.toLowerCase();
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .map((host) => host.replace(/^www\./, ""));

    if (!hosts.length) return;

    const hostMatchesDomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);
    if (hosts.some((host) => allowedDomains.some((domain) => hostMatchesDomain(host, domain)))) return;

    const foundDomain = shortLinkDomains.find((domain) => hosts.some((host) => hostMatchesDomain(host, domain)));
    if (!foundDomain) return;

    try {
      await message.delete();
      await message.channel.send(`<@${message.author.id}> ショートリンクは禁止されています！ドメイン: **${foundDomain}**`);
    } catch (error) {
      console.error("[SHORTLINK BLOCK] メッセージの削除に失敗しました", error);
    }
  },
};
