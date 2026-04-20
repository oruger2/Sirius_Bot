import type { Messsage } from "discord.js";
import convertToCombinedText from "../utils/convertToCombinedText";
import scheduleReminder from "../utils/scheduleReminder";

const REMINDER_INTERVAL = 1 * 60 * 60 * 1000;
const DICOALL_BOT_ID = "903541413298450462";

function isUpMessage(message: Messsage) {
	if (!message.inGuild()) return false;
	if (!message.author.bot || message.author.id !== DICOALL_BOT_ID) return false;
	if (!message.interactionMetadata) return false;
	const txt = convertToCombinedText(message);
	return (
		(txt.includes("サーバーがリストの最上段に更新されました！") &&
			txt.includes("サーバーリストのトップに正常に表示されています。")) ||
		(txt.includes("UP was successful.") &&
			txt.includes("The server is displayed at the top."))
	);
}

export default {
	name: "messageCreate",
	async execute(message: Messsage) {
		if (!isUpMessage(message)) return;

    await message.reply('UPを検知しました\n1時間後に通知します');
    scheduleReminder(message.channel, '前回のDICOALLのUPから1時間が経過しました\n</up:935190259111706754> を再度実行できます', REMINDER_INTERVAL);
  }
}
