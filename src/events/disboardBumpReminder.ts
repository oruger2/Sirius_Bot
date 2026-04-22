import type { Message } from "discord.js";
import convertToCombinedText from "../utils/convertToCombinedText";
import scheduleReminder from "../utils/scheduleReminder";

const REMINDER_INTERVAL = 2 * 60 * 60 * 1000;
const DISBOARD_BOT_ID = "302050872383242240";

function isBumpMessage(message: Message) {
	if (!message.inGuild()) return false;
	if (!message.author.bot || message.author.id !== DISBOARD_BOT_ID)
		return false;
	if (!message.interactionMetadata) return false;
	const txt = convertToCombinedText(message);
	return (
		txt.includes("表示順をアップしたよ :thumbsup:") &&
		txt.includes("で確認してね")
	);
}

export default {
	name: "messageCreate",
	async execute(message: Message) {
		if (!isBumpMessage(message)) return;

		await message.reply("BUMPを検知しました\n2時間後に通知します");
		scheduleReminder(
			message.channel,
			"前回のDISBOARDのBUMPから2時間が経過しました\n</bump:947088344167366698> を再度実行できます",
			REMINDER_INTERVAL,
		);
	},
};
