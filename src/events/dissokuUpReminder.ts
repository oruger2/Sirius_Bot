import type { Message } from "discord.js";
import { Events } from "discord.js";
import convertToCombinedText from "../utils/convertToCombinedText";
import scheduleReminder from "../utils/scheduleReminder";

const REMINDER_INTERVAL = 2 * 60 * 60 * 1000;
const DISSOKU_BOT_ID = "761562078095867916";

function isUpMessage(message: Message) {
	if (!message.inGuild()) return false;
	if (!message.author.bot || message.author.id !== DISSOKU_BOT_ID) return false;
	if (!message.interactionMetadata) return false;
	const txt = convertToCombinedText(message);
	return txt.includes("/up") && txt.includes("をアップしたよ!");
}

export default {
	name: Events.MessageUpdate,
	async execute(_oldMessage: Message, newMessage: Message) {
		if (!isUpMessage(newMessage)) return;

		await newMessage.reply("UPを検知しました\n2時間後に通知します");
		scheduleReminder(
			newMessage.channel,
			"前回のDISSOKUのUPから2時間が経過しました\n</up:1363739182672904354> を再度実行できます",
			REMINDER_INTERVAL,
		);
	},
};
