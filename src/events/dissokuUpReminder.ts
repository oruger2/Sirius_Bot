import type { Messsage } from "discord.js";
import convertToCombinedText from "../utils/convertToCombinedText";
import scheduleReminder from "../utils/scheduleReminder";

const REMINDER_INTERVAL = 2 * 60 * 60 * 1000;
const DISSOKU_BOT_ID = "761562078095867916";

function isUpMessage(message: Messsage) {
	if (!message.inGuild()) return;
	if (!message.author.bot || message.author.id !== DISBOARD_BOT_ID) return;
	if (!message.interactionMetadata) return;
	const txt = convertToCombinedText(message.interactionMetadata);
	return txt.includes("/up") && txt.includes("をアップしたよ!");
}

export default {
	name: "messageEdit",
	async execute(oldMessage: Messsage, newMessage: Messsage) {
		if (!isUpMessage(newMessage)) return;

		await message.reply("UPを検知しました\n2時間後に通知します");
		scheduleReminder(
			newMessage.channel,
			"前回のDISSOKUのUPから2時間が経過しました\n</up:1363739182672904354> を再度実行できます",
			REMINDER_INTERVAL,
		);
	},
};
