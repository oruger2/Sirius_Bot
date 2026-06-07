import cron from "node-cron";

const HEALTH_CHECK_URL =
	process.env.HEALTH_CHECK_URL || "http://localhost:8000";

// 10分ごとにヘルスチェックを実行
export function startHealthCheckCron() {
	cron.schedule("*/10 * * * *", async () => {
		try {
			const now = new Date().toLocaleString("ja-JP");
			console.log(`🔍 [${now}] ヘルスチェック実行中... (${HEALTH_CHECK_URL})`);
			const response = await fetch(HEALTH_CHECK_URL);

			if (response.ok) {
				console.log(`✅ [${now}] ヘルスチェック成功: ${response.status}`);
			} else {
				console.warn(`⚠️ [${now}] ヘルスチェック失敗: ${response.status}`);
			}
		} catch (error) {
			const now = new Date().toLocaleString("ja-JP");
			console.error(`❌ [${now}] ヘルスチェックエラー:`, error);
		}
	});

	console.log("🕐 ヘルスチェックの定期実行を開始しました (10分間隔)");
}
