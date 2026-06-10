import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	ComponentType,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import prisma from "@/database/db";

interface Food {
	name: string;
	danger: number;
	deathReason: string;
	image?: string;
}

interface GameState {
	day: number;
	hunger: number;
	hp: number;
	currentFood: Food;
	mustEat: boolean;
}
const foods: Food[] = [
	{
		name: "おにぎり",
		danger: 0,
		deathReason: "ごはん粒を一つ残した",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj5VsD60JSuXklQr5dxCgcxAlKLTgz-FGPBNgiXP0E7NSAZEnPp1WYAZRFbk3jbXFmLyF7snR62YHhf-S5G9zrh22cgCmZcsZq_0H8Ie6Mb_cGFzdfsmlKy85jMam0FTrwsvijBiSemBbID/s800/onigiri_maru.png",
	},
	{
		name: "ハンバーガー",
		danger: 1,
		deathReason: "パティーがなかった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgujVNYlDUUQ7Lp8k9ahcr6gzPjDs0h_8QpLJ4MfvLv54yPzr77jxo-AsL1Da3j673fOLWmk29VUB8Z7aFn1pb0FEdoBv8HDDNj_tx3J4JPjvL7okazprqSeg9miTJdwvlKwmhv-0EPwM6r/s800/food_hamburger.png",
	},
	{
		name: "カレー",
		danger: 2,
		deathReason: "カレーは飲み物ではなかった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjpjN92CMfQ_dLq55wvok9j_e4BFZdlUWQLJ5jaNY8onXGgu5cYY_oXy51GyZJ2uOPNevXlM8jVxWhdEUcOd1fWXoa0v5c7xuno09DaEG3dsBWkgClQNQYPBCdqyo2c1wAvbX4iQ668AN9H/s800/food_curryruce.png",
	},
	{
		name: "ラーメン",
		danger: 3,
		deathReason: "ラーメンのスープでむせた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEijQFSiB_2tYowkTZYG58CjFidc7IFBBtcfJ6R98qAN7d1pQW6Ei11yw_fcLdD4MkGnjiqUORQBh5g-QhuZP6LOxGWdS38wz6tUr3PQM9eKFsu60fG87X1M5YSd0Wg8RL7-hGScc6SRPlWj/s800/ramen_syouyu.png",
	},
	{
		name: "うどん",
		danger: 4,
		deathReason: "うどんを勢いよくすすりすぎた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiR6s_0YiJ0brlB6Pj4Rp2qYdz0JZiCBnmQ7lAB8x0P0Pt9WOYPlDHmYzVK3l9ZcHkL1zSSdMYBQSGqTFu5JvqR2QtSw606u4ekdU30rEg9Y3Sc5ijyjBeFo-LwmNc9YN8fMeJ3wODuIjL0/s800/food_udon.png",
	},
	{
		name: "寿司",
		danger: 5,
		deathReason: "寿司に食べられた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhnFR5bNaKk3rRor5-ZbT0mq-u5Lw34grDRjrcC-FDlMxWtRAlv1ZsMNPSXCCeAfkSKq2BhX9WsgqSUlpcE4xrVMRPsla6qDaLpV9L94aS3cflZDD-0HF9P_Ks2-2-DVomXL3PGfYhFqRon/s800/sushi_oke_nigiri.png",
	},
	{
		name: "ピザ",
		danger: 6,
		deathReason: "ピザをうまく6等分できなかった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhFS4iOlsDPNhkBtKjU8Cc1bOm9RqIA-4clGM39S0Z2rdVXLa8TsvVSuLA0fbj3yAp-hS404p5s0rJNm8CfnQJyxIzPUJejGdieQE1wb2DwlhNGgtzaBPhvbJ0kIAZhazNK6ODnATmGX8I/s800/food_pizza_takuhai.png",
	},
	{
		name: "唐揚げ",
		danger: 7,
		deathReason: "唐揚げが熱すぎた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiK133DxAaE5XSIf2lXjX1xqmm2OQKDEMKhkukPplIZPHCyJgiI-cc8Jr6R7y8TocRTHacEyD7h2gOF6WLtWu_jE3JbcWuRmmeb2d8tcWlqYupdaghJznunIh2-7B7kdwLBUSLVUdGYZsY/s800/karaage.png",
	},
	{
		name: "ケーキ",
		danger: 8,
		deathReason: "ケーキを一気食いした",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjNXU57yjYCpUt3_gRlGJUyLUqegJhk6puWXE6kb4E8Y14GNrAh8DGkfDAGaOZnm8wmqs95OLxwXYTj1WPddiP2TCk0dUjUS-FySSj4tMWoGgifU4EjO2fAzoN8OpD4CzYkMoNdXPblIzIQ/s800/sweets_shortcake.png",
	},
	{
		name: "アイス",
		danger: 9,
		deathReason: "頭がキーンとなりすぎた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjXBuOWjPVBYtI6ht_aTShXaKg7Oq3zaA9kuW4PBf_EKQvIa3GvIIHqglZWs4-zF46L56JvHx-9PgVPLv9T1f97ANhAXlyusjCmFqeUcnWaa4aAwLtHDqetWe7gg6_nCFbdPa1lQPT8cFM/s800/sweets_icecream_3dan.png",
	},

	{
		name: "消しゴム",
		danger: 12,
		deathReason: "消しゴムの角で頭をぶつけた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjyeZMfUCEOdxB_D-oKUy2hqXQXcN5croCuckKyohwI6SL0-CY60b6Lm4qD-vn5OiZ06lpE0KUC2Ri7ryHIkcx1sHktgzw-ftdVon3mH5pVVVzJB8cwKWGeczcEyWc-IlyXEONwXNTFo9A4/s1600/bunbougu_keshigomu.png",
	},
	{
		name: "ティッシュ",
		danger: 14,
		deathReason: "ティッシュが気管を塞いだ",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgtAOOTS9CAno1RIuWZN4sorJqURpq0CfxCwpu1FxWG5_AncIefQQ7Rs71ZUEiHz3kRswDd9it_CtXntzzgXjmLyrhyZhTm2cVLZqnGP5RsMPBy7-HwFWsJ2irQOyfqCb8gcjMgS5v-6HD-/s1600/tissue.png",
	},
	{
		name: "紙",
		danger: 15,
		deathReason: "紙を飲み込みすぎた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiR6s_0YiJ0brlB6Pj4Rp2qYdz0JZiCBnmQ7lAB8x0P0Pt9WOYPlDHmYzVK3l9ZcHkL1zSSdMYBQSGqTFu5JvqR2QtSw606u4ekdU30rEg9Y3Sc5ijyjBeFo-LwmNc9YN8fMeJ3wODuIjL0/s800/paper.png",
	},
	{
		name: "段ボール",
		danger: 18,
		deathReason: "段ボールの中に隠れていたら窒息した",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjt_H0O2xTXEOY28JSy5IdEXeZIgV1LQ43t87P1qx6srZKUO6d6rXd9QUgpc4vu60eYQ1M_wcqrABP85IbKQfqbRP6kgZJZUehGTqr-pVkcqvNvqnvMJlBzqFukTIIi3sOJ_Ih0PbjAa4JK/s800/cardboard_book.png",
	},
	{
		name: "綿あめみたいな綿",
		danger: 19,
		deathReason: "綿が喉に絡まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEirq4Yh5OxeQbeWF8Ql2um0788RdnIL8GNSXwjy33ClMYDqdquX-vn9NZKV6jN7AwJ2H52CqK58NXzSMEIVs_cqGxaZSVZHfEVMj7b72QugfVYQZVKgHQzMEiYarpzZBZH9h_qRMLpsVUd6/s800/saihou_men_wata.png",
	},
	{
		name: "クレヨン",
		danger: 11,
		deathReason: "クレヨンで胃の中がカラフルになった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjnXsySOKpXusyZIv2-6ic9ZmeawgBcZqydWE3_Imu73tLTo_TdGuBwffFEB4IWjBhERBDp89CTOJdbDmW_YrfbGGL1rDOvFn5kWGC9PGS489q-Tfu6P14b2Ec7QdegMUmThTJ6g13Nbbc/s800/omocha_kureyon.png",
	},
	{
		name: "色鉛筆",
		danger: 22,
		deathReason: "色鉛筆の芯が刺さった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiMa4JGYpvQ12Wiq8X3hJv-xYaAgsk2ncs15fzcqqshoWasw6lSMiqgd5HWLVCI71EC2O-A73Vz5Kb9N2-G4bGExesr3ghgjlt_SeXdE00N61of9MyCGV1iPelQyuM8NiXWJ4ChHfxa92w/s800/iroenpitsu.png",
	},
	{
		name: "鉛筆",
		danger: 22,
		deathReason: "鉛筆を噛み砕こうとした",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjh7FUsguv3kj27LTMzGyR8dpworfflB1hRI5Vo2IEcPY1pMu7zvJDaMbXZzLImcBRp8XHxpszNgfmhHiC7oK33otMC0IbPBYW0fcWT5HdWvMPyH9Ryfv40Ux1RJhyphenhyphenTp3_wmEcM5Qw7sQE/s800/pen_enpitsu_mark.png",
	},
	{
		name: "チョーク",
		danger: 20,
		deathReason: "チョークの粉でむせた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh1Ww4SCZbnT3DDWOqsezrsVlk5mdUYA6ESwYFlOBg1MGgMsU4QUZCQM7mzKCl1L579dBETuxY6dgT8fZ-R_cumjzB0L9N5vxrKen_nOFTOYB6b2KrngQoQv0OcWzXg1rwQXmbDFLPatFzP/s1600/chalk_white.png",
	},
	{
		name: "スライム",
		danger: 14,
		deathReason: "スライムが気管に入った",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgPEnaTjO3Bhl_nUapYh7CYQCGcvNFv0KIDbWOPhdQSg-Cz4zh1nHBfxVoTwt-sN2NdeV6sRggpFUgwxWxhILZnT0Dc2N2d3eBz-urwwzpPwdYkfN29HqzmaTAN9DCVdXWbhrz7h870_SYf/s1600/fantasy_game_character_slime.png",
	},

	{
		name: "スティックのり",
		danger: 16,
		deathReason: "のりが口を塞いだ",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhKAo1AGihyphenhyphenpbQ_fmZjUm87X9ZWDBCL2L6DdieKf2233FBLsBiC2c5oxGBhtB_5YNuvmueUdMlTf0ihLSmsgUMwK9PScUNZa7Y18J8b547q-gGmrz5i3rD4ooamY7k3spcvR0NQrEJUCGB3/s1600/bunbougu_sticknori.png",
	},
	{
		name: "石鹸",
		danger: 24,
		deathReason: "石鹸の泡で呼吸できなくなった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiZ9hmkuEUKFE-rBdyECXsA34lPov29aXkNHps3uwu3znEETiq2SYYduu2l08QUGA-vU1nuLqiAFoAWC2y82WS83v1-z5gS5s_8zsGusfhs9h52hjmDxNBjQMKf_-Hyk-s-gHQ2VsOGpBs/s800/furo_sekken.png",
	},
	{
		name: "ロウソク",
		danger: 26,
		deathReason: "ロウが喉で固まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgo4r9MyAb9H0TaXdPebOsf5rNuKCW10-Z-wdQQkTZDv29yA-7EdD1w_MVi-iS2qkpptSPfiweFVuIjkTllUmjQlDuJ-HKYkM6L7soJ6SwQ5LSfeevEeSOPBW6BP69g3Nsbxt_6KRQIUAmv/s800/rousoku_wa_fire.png",
	},
	{
		name: "木の枝",
		danger: 28,
		deathReason: "木の破片が刺さった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiIRRqS03lHUd7PCUDUQv1D98kogyp7XxRpi14T8Yenr0si2-fRbxW_YACKZ4ZaGmsfYnuXA8y8dcZN9S7QhMwGgOvGYYpckRV526hS-CqgeZ4RZVeIzpNt96qnrOwwNPa065Ew1Zd0g7ge/s1600/plant_eda4.png",
	},
	{
		name: "ビー玉",
		danger: 17,
		deathReason: "ビー玉が喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgQIyAOBhRmR1ZOrsRRXlfDFzRU5sjiOQIn8LVmDgzKFCr7hfk3-mLGRPaEiTstWZCd-ogcKFY10Yc4jXXQ0sYWPEjWUgVOOTNl3TxXDSSl9LYb5nXExkbedLx4ugGmG9FgEzWEVTRiCf6i/s800/biidama_green.png",
	},
	{
		name: "ボタン",
		danger: 24,
		deathReason: "ボタンが気管の入り口を閉じた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhd2dSF4vjWjUNOpRzWSGhDpeUDS7FZ5Tt0l7ab2HVpFnUdrA7cH59yq3IzotP0qTRlhQXZn7BfMAQVc0iOcVy84LxrSQMq133I-CjI5GuneD6hWPk-UgsJuQ3sRBNRWH4JVK3WQTpfKbOm/s1600/fashion_button1_white.png",
	},
	{
		name: "輪ゴム",
		danger: 15,
		deathReason: "輪ゴムが胃で絡まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgUWa6HLllpeyUKgR3iDaEDuiu8U_cm4TVyLAYDK_q9yjfTsMiJS9KCtxg0Ck_VWHm227IjWi8ol_TtKEiF0wU2KYN_JuRb9pPfoYMA-AhUqDS-_FxyLOyZaLH9_LxXKJjjOEiybBVXf7RJ/s800/bunbougu_wagomu.png",
	},
	{
		name: "粘土",
		danger: 32,
		deathReason: "粘土が胃で固まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj3J3_mEHFOGgX1nR8wda54jjRrMQ2xNI1aBpYfOWe6OjyVuVjdI6kM5ZimP7ybzlFq2tyZFhgZxEk9rFyscKy_3571fNGpTnKUP5yfb-nN8X0uR1oXkW_YPAP_NJU5hsf9KxRFg9mMDbKF/s800/nendo_board_white.png",
	},
	{
		name: "乾電池",
		danger: 65,
		deathReason: "乾電池の中身が漏れた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjPhpbbV8WV9jy32QDtffrPS3Ol88nnT8eK2ga-OOd2TXUSm6ZeqNuuAVhsEjaZvoW9AzTuqaShrCveQOhdsuNOQvtatydQocHaYquDH_87JbCRUjEjQcTvIChqnEiINv_60ZvG6qcg5jzp/s800/battery_tan2.png",
	},
	{
		name: "蛍光ペン",
		danger: 24,
		deathReason: "インクを大量摂取した",
		image:
			"https://cdn.discordapp.com/attachments/1480902153655681064/1513313288182562917/image0.jpg?ex=6a274653&is=6a25f4d3&hm=12c40235db4d5cd26aff782e1ebf43c4efc69259cc44dc33a4c0e3cfffdd6281",
	},
	{
		name: "発泡スチロール",
		danger: 33,
		deathReason: "発泡スチロールが喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjzbDIakTPiKZIvjtA54p93GdT7O-9JsAxyBhIvbOrRSmgOyBByVMNGGTg_bgbyWmcmukU67ceyM_Qjh6B2U4cRYtt8pQd2z_tMbVbd1RBa4OogEbdUwoganGcMDmibbcxXGfbLVLrt7GRI/s800/konpouzai_happou_styrol.png",
	},
	{
		name: "プラスチックスプーン",
		danger: 30,
		deathReason: "スプーンの破片が刺さった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiBvJzzJzChstKUaNqXJMH9z78gOWAOqsL8JNcAG32IcXuq4wSzvXIJekwVD7DdpmiOYhNbjylvP_iR-IC3SUN37-QrxD90zAHGjrIuHOHS-xBEfJQI_0ThH1JYD67u4i1cT-N-vfxBEKfz/s1600/syokki_plastic_spoon.png",
	},
	{
		name: "プラスチックフォーク",
		danger: 35,
		deathReason: "フォークを噛み砕こうとした",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiU1A5xj0EuEzLXXN9lB0atLsh6owQbcJYPppwsK37ty7Qena5vBHJE0jua3UTHFFdtyJCvDG1CvBbAyds00B_m_pwKR1RsxvXL741JEKPhLXhd1SY6WGUROtVsmV61auy0E0zR3spDHNqu/s1600/syokki_plastic_fork.png",
	},
	{
		name: "ストロー",
		danger: 18,
		deathReason: "ストローが気管に入った",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh1bzU8YV1QdZhotKKmlsUBK00rec2zX8bSY8s2WOTcqTWjLQnXMCp5ofCfj7X6WCsbUBBAEFb33eb6La5FR9U4-HCQ1oYKqm_liAoHnGLH7UxlPQ-0x50pdfkkiVfZf5uQxAt5UAKB3JGO/s1600/juice_straw.png",
	},
	{
		name: "割り箸",
		danger: 21,
		deathReason: "割り箸がうまく割れなかった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhHju3O1FAASQ9c0hcuNLy75hM-HaRxC_6c16Eh2qev8ttTHBl8RIcFrnAGoKB-fKYzWHYwYVsUNwfnWoiVzrkrq1Ww0q8SlhsXwBwq7ifPXNVr6HbrMLetLTALJSmTqRZGE4-d9fPdvZ0/s800/obentou_waribashi.png",
	},
	{
		name: "爪楊枝",
		danger: 30,
		deathReason: "爪楊枝が喉に刺さった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhdAZr1WhOXckegngXSYM0li7qDG4EjFwb2KRQJUMO-oHmR3BENmy4aF4wcFkDVSZ6Wta4Fj18Flj4vePfCzl_ZP3BtMq1QuAcB0uRVxD8hpEIumUZybEWH1tG-NhXV35YHENlAQs71V3AS/s800/tsumayouji.png",
	},
	{
		name: "ヘアゴム",
		danger: 27,
		deathReason: "ヘアゴムが胃で絡まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgrIJ5MgT6HW1mGYNC2U51EHQrC8gJVAH-gEh3yECBphEU8mfdd5EJ8jjM7XWh-lnHwQgUUJFwRc8a136KCnXbuU2DoAgPUcPWLrgStjZKcjoosWg5xBpB5bLWYmXlnEv6ZJe_wivD1dOU/s800/fashion_syusyu.png",
	},
	{
		name: "セロハンテープ",
		danger: 27,
		deathReason: "口が塞がった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjG24lzskuEgsQDd0OA-ZKwq7HNBCtsej1WqN-VmMLT9JGU20lmID5ocGMqfvl2BVpdDsxyaNET1o5UzX0EdCf1GKYV630gYbYsXyXf1zpPwABDF1_lF8CDoRbhDOQfSVIygAIpKRSOwVEK/s800/tape_serotape.png",
	},
	{
		name: "ガムテープ",
		danger: 35,
		deathReason: "ガムテープで口と鼻を覆われた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEg_uT-4Osqy3ak1PMvNpdQI1M9dt9FOEn-NiF-nhaeu_znyakrE5hpVaKs_v-i3AqWf_HRlS9a16VGhVG6T5fFVRj9W9v_0xbuV2bWLvol_FtUBpCSIk6HzThuImIhAxE36TEhmItVGIyw/s800/tape_gumtape.png",
	},
	{
		name: "接着剤",
		danger: 47,
		deathReason: "接着剤で内臓が固まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEitfwf6XqGgteVveUa5FIQGByUjGQ9cLoOyfrqDa8tRQeeneDolgbJmmRMA9nejSutoEMBrc8B0_acShq1DFfRfxsw3lRi1Vuik8tia_VbF1R1SCNsq3lK4mZXM6xwpaSJ-7dFIol30z4c/s800/bondo.png",
	},
	{
		name: "洗濯洗剤",
		danger: 48,
		deathReason: "胃の中がベタベタになった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhnuugkn6zMbgciWKx3wd6ydPAiTgsohKlpfP1WObmoa0K9wC9LbJmVLWJcBwsWv3ZOqZsJtb8XeV3IJIMOVm34xwwP3FR5MATcDihy4Fe5IHGMj1iQuvwdV48cJrgcmEOEyaaN_aqnWMs/s1600/sentaku_senzai.png",
	},
	{
		name: "食器用洗剤",
		danger: 34,
		deathReason: "泡で呼吸できなくなった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgufb7X_4rb6flfcCOBDUzULzI7KtdA8ZEnse6KMlnvVk_AmEjMxioRRMJdkBmZq5VsLLQpEc5-2YLmXtl2slVCt1ElWF4BQYWUUhgwEUOqU1d3gIad3yaaxliuJKWquBG-9MCz34JFWyet/s800/senzai_syokki.png",
	},
	{
		name: "シャンプー",
		danger: 31,
		deathReason: "シャンプーを飲みすぎた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjrN6p7noTtqoZaS4KQHVhx3dKTeULoYFilhLjr2Al2JAEfQ28LhMILLKBTNFArHE9vK2oywW9_MbSxOaB2PoRT-hlUM6J4X1yLR6rKeep2OLIAJtozwQcIISrjPOTCQK7P9llEZBRz67ij/s794/hair_purple_shampoo.png",
	},
	{
		name: "ボディソープ",
		danger: 23,
		deathReason: "胃が泡だらけになった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiZhT1OHyz3ecWku0YSfBXPYhn9WjmFJcpbsvN7YBGvZzSORKstM1bRgSWhj2Q3bjjpfh22bHvNjC0r2-l3el8Vlc5pYBB-3TTVAKXq0igoxmPkmRUZ3BPHyo22ycd55_-UmaqdqO85UYGN/s1600/sekken_hand_soap_bottle.png",
	},
	{
		name: "歯磨き粉",
		danger: 10,
		deathReason: "ミントの味が苦手だった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiLkxPgBvq4XmdCP3eM50TTlQTDlw0GnzgXepWJSHKv7FY_s0gBV4U1gPoRQDYynU62Q2t8nmtqNVUmm5UkoAsxuiTpwyGgCRjFOpUTn0309zK8UZ-5cM_ujLTeVyL753eHAN1Hx5xrgPH2/s800/hamigakiko.png",
	},
	{
		name: "口紅",
		danger: 14,
		deathReason: "胃の中が真っ赤になった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj2fSQAXMRmw6DQ5FZfJy90a-7MyUyDOe4hWVRknoJxaDMCQFVwyg_-grsEX_4dpmJM49wrilxGAxMqZhWztf18DzShKIvzXltC8tZYD0KeoRx4QIlb4Bo7cm0szsq_ENNCVKY2lObA2GSz/s581/kuchibeni.png",
	},
	{
		name: "シャーペンの芯",
		danger: 12,
		deathReason: "シャーペンの芯が刺さった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgSesMgF9B5crf8pTUhp3RxYDW3V8rUcIr5Sl_gHxHVIEvymCHBxgemrT_OlSxCAFu0xjTrXckLGznDQZMkV_sHJGI0dIDzwg9Z0CIVfW-VqX2siDnu65F6A77c8ADqjPGJtalMtbbyE3_E/s800/bunbougu_sharppen_shin.png",
	},
	{
		name: "シャーペン",
		danger: 11,
		deathReason: "シャーペンが喉を突き破った",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEikBSnPwNJWvzF0eN3SrXbNqgp3fCg1W8wW7_nP-dh_hZ8yHbRvh17ZheSOdJT1YtRii0ko5qcapmRNcVAldpM8DhETHEuSlKx0dNhfm-nNg3VgRzYX3xIgZu5hiHkl8rU-FHQP7QaAibkd/s800/seizu_pen.png",
	},
	{
		name: "カニ",
		danger: 26,
		deathReason: "カニの爪が喉を突き刺した",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjz0biB17cJqro957Jm6LcT1VK9yFkumQk1sbFyFW1VcFugcs_ZEyzMhqm3o9oYKHhMa0b_FRmcnjWdpCowiZxJKwx2YcmP6Ith5OF3Pp285NhZJma4HKyZJJ6v88m2hp04NuNn6rS7TmU1/s600/umi_kani.png",
	},
	{
		name: "ワイン",
		danger: 17,
		deathReason: "酔いすぎた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj067Jze2eb3uMM8rF2EVBlJruDVqIV58bsNLfnjTRFUPikopwH8UL8ag0y6Dzwwm6rnjwXmc4vTwUn_r0N1NsefOs4LCaqf0F9KyCqgzj2TU2IORsCtUYRAqANgsYUA8F6FoPSSMYU6Yw/s800/drink_sparkling_wine.png",
	},
	{
		name: "フライパン",
		danger: 44,
		deathReason: "フライパンが熱すぎた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjFIVDDYuLzd9P-Te4zg7x9dPadTEUCMTBZmXriCB1jr9YHLoJ6NjiZNVKTB1ig25QNmY6TuLkM4hpEVv1dkQ0yPjbYQPcUyD4oObDObklgGdErhLcbMUOd9ZijVscgbKB7gzMEnEuG-YY/s800/cooking_frypan.png",
	},
	{
		name: "人形",
		danger: 37,
		deathReason: "呪いころされた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhVXyqH-GVOB9Kd6Srvxo942Lboy3lD1_rJ5k3doqF7ipUp3oAuMzAVqzslrpEgKeqYbgUmqCKsCA90GxK5dCzrD_fN6To-X3bCzXOsTKPdZYOr90S9QkD1JzLGFB6InMzyJsgGyPI_r1qa/s800/toy_france_ningyou.png",
	},
	{
		name: "教科書",
		danger: 26,
		deathReason: "スイミーは大きすぎた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhLxia9QdF3GzQPWaaF1EGfyOKoaVnhY7q1AhP_UxR_Kno-0UJqN0tJQesJu9foR7KzHyk1HpHdpjEpZPlWlguzw2qdzfu-z7a7n2hG2AsFcOGVImLwHpQpKUB9oKcl4Vu4Mal2eGAw1jnL/s800/textbook_5kyouka_chuugaku.png",
	},
	{
		name: "消しゴムのカス",
		danger: 11,
		deathReason: "胃の中で練り消しになった",
		image:
			"https://cdn.discordapp.com/attachments/1480902153655681064/1513370291575853107/image.png?ex=6a277b6a&is=6a2629ea&hm=7ef32a213847c84193229ed6641391b73e8f375cf378596297a2ef9c677ed34d",
	},
	{
		name: "カッター",
		danger: 40,
		deathReason: "カッターが喉を突き破った",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgA9iLiGzBN2N_jGFgRE4h2W2ktOjgIz3wktfJQnZfUSoqey6_vrCep-t0O0iFMyY_eAScRtVxf0VpkrMG6xRUg0bGK_7eV6vFpokv-xoENhkvnHYOOD_lAmKXe03n_2YveGz9J3tPsnSiD/s1600/bunbougu_cutter.png",
	},
	{
		name: "おはじき",
		danger: 15,
		deathReason: "おはじきが喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgy1V2Tel0fP3dNzCfmiPHWu1GelFNEXQkbrgYu7PrR9Ri5UA2WontqyzyVSbHxCIO3o3-VNJa6kMml4xAIaQfDMXkMhkEPQB9Ne48_tZEdneZYXyfQLNtr0xXLrFloAkAWj3YIcAVDlGUF/s1600/toy_ohajiki.png",
	},
	{
		name: "バレーボール",
		danger: 38,
		deathReason: "バレーボールが喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjebatlM7TiMX4OjedW6GVeY0jtqSCHIBo6rcbHUXir1yiuuYighsRJLh5YSxNcDSE78Z0_22J2y_3OpJJFXfsINzAhrcrAYm3Be5OYNlGTupr5KK2g5rpKk8OROxHTotvNU-l5Po42vFBt/s800/sports_ball_volleyball_greenred.png",
	},
	{
		name: "オムライス",
		danger: 5,
		deathReason: "食べきれなかったのでもったいないばあさんに殺された",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhg5nDb_mCwhuyWtSDadS6fFWmUKskJCha5EifBMoq68cjQDZ11qrrEbRvUApAUlslPxUMNSshjnXqQpSZz1SBgwWdBTD7-i4tCsU39fQukZDMjRHmB8V5UgTak5uhbV-RwF37CIRnRt9Ex/s800/food_omurice.png",
	},
	{
		name: "スポンジ",
		danger: 38,
		deathReason: "体内の水分を全部吸われた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjevwiJXcb9Qy6c1BiAgBPGJrE2CfN0bCE3L2E7Tj3lpf7YHxhgcq77Sl3U8dUZv5XD52N1QM8NoeG5r8U5RDpzcdEwff1RB_j5wa3G_rvUJeRSqwzPUFBG432WJy7Wq79yHtFD-cSJn7k/s800/cooking_sponge.png",
	},
	{
		name: "石炭",
		danger: 32,
		deathReason: "石炭が胃の中で燃えた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh5Rof24HVGKbrk4o7UhfqnvnTo5ZCb1l3ozGBvnfUe7yMouGAZae5GWGw_wht_AHR14HjtfjtNMmPUq7ZiHG6N-SFmta1b6XT8Bzb6bOg3Fry5pYihxV6a2oZTYZ56E9hWnyDnhcQqrqQD/s800/nenryou_sekitan.png",
	},
	{
		name: "木片",
		danger: 22,
		deathReason: "木片が刺さった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhWC4CO14m0GEfo5QlG8PLOb-mHvw693uvmbF-aLnXDyeFcxIUL3K4UhMc0A_mVTsWTK0zpyhfnSjuTl53zkyqK1huCbqC12eGlbH9UUJAGYu1tjwZbPD0gissoUocj8Jtb_8LwODvcs2iC/s800/nenryou_maki.png",
	},
	{
		name: "落ち葉",
		danger: 16,
		deathReason: "胃の中でダンゴムシが大量発生した",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEi1Ogzcfqnkb5qEeTr_gSDW5xN9DP3ABtiB3yErx9wJqCZEU_ZyiMpLhk7dvxevSwiXhW8AgVyy9aAxTT2iZ7PpiK3ioDQPkRQqTQtIKgkqRBG_lGX9U_nfiY2aoGzT8JSBJWyYY8Oweu-9/s800/ochiba9.png",
	},
	{
		name: "芝生",
		danger: 13,
		deathReason: "喉がチクチクした",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh_sLzXW_ryGHZoOgGmDL7R9mHDfgkkgtqWoP-vuW8nVJJRaQ9pmQtCwM4TFYCPaqk2upqtkHhW-mdgf9DxmIK96nq6hHz8_SLOnMJ5kzOJNocU1PnKCDPPP6-xGl3usbZLGOHWAXpn8HQ/s800/kagu_carpet_maru.png",
	},
	{
		name: "観葉植物",
		danger: 15,
		deathReason: "観葉植物に反撃された",
		image: "",
	},
	{
		name: "花びら",
		danger: 10,
		deathReason: "花びらを喉に詰まらせた",
	},
	{
		name: "松ぼっくり",
		danger: 35,
		deathReason: "松ぼっくりを丸飲みした",
	},
	{
		name: "どんぐり",
		danger: 23,
		deathReason: "どんぐりが喉に詰まった",
	},
	{
		name: "小石",
		danger: 25,
		deathReason: "小石で歯が砕けた",
	},
	{
		name: "砂",
		danger: 31,
		deathReason: "砂を大量に吸い込んだ",
	},
	{
		name: "泥団子",
		danger: 29,
		deathReason: "泥団子を食べた",
	},
	{
		name: "レンガの欠片",
		danger: 64,
		deathReason: "レンガの破片で口の中が傷だらけになった",
	},

	// 71～80

	{
		name: "自転車",
		danger: 71,
		deathReason: "自転車を食べようとして顎が壊れた",
	},
	{
		name: "原付",
		danger: 72,
		deathReason: "原付を食べようとして潰された",
	},
	{
		name: "バイク",
		danger: 73,
		deathReason: "バイクを飲み込もうとした",
	},
	{
		name: "軽自動車",
		danger: 74,
		deathReason: "軽自動車を食べるのは無理だった",
	},
	{
		name: "普通車",
		danger: 75,
		deathReason: "車を噛んだ瞬間に敗北した",
	},
	{
		name: "トラック",
		danger: 76,
		deathReason: "トラックに返り討ちにされた",
	},
	{
		name: "電車",
		danger: 77,
		deathReason: "電車を食べようとした結果だった",
	},
	{
		name: "冷蔵庫",
		danger: 78,
		deathReason: "冷蔵庫が大きすぎた",
	},
	{
		name: "洗濯機",
		danger: 79,
		deathReason: "洗濯機を食べる前に力尽きた",
	},
	{
		name: "一戸建て住宅",
		danger: 80,
		deathReason: "家は食べ物ではなかった",
	},
];

function randomFood() {
	return foods[Math.floor(Math.random() * foods.length)];
}

function calculateHungerIncrease() {
	return (Math.floor(Math.random() * 3) + 1) * 10;
}

function calculateHpIncrease() {
	return (Math.floor(Math.random() * 3) + 1) * 10;
}

function createEmbed(state: GameState) {
	const embed = new EmbedBuilder()
		.setTitle(`${state.day}日目`)
		.setDescription(
			[
				`## ${state.currentFood.name}`,
				"",
				state.mustEat ? "⚠️ **食べないと死んでしまう！**" : "",
				`危険度: ${state.currentFood.danger}%`,
				"",
				`🍖 おなか: ${state.hunger}`,
				`❤️ 体力: ${state.hp}`,
			].join("\n"),
		);

	if (state.currentFood.image) {
		embed.setImage(state.currentFood.image);
	}

	return embed;
}

function createButtons(state: GameState) {
	return [
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("eat")
				.setLabel("🍴 食べる")
				.setStyle(ButtonStyle.Success),

			new ButtonBuilder()
				.setCustomId("skip")
				.setLabel("❌ 食べない")
				.setDisabled(state.mustEat)
				.setStyle(ButtonStyle.Danger),
		),
	];
}

export const data = new SlashCommandBuilder()
	.setName("survival")
	.setDescription("サバイバルゲーム開始");

export async function execute(interaction: ChatInputCommandInteraction) {
	const state: GameState = {
		day: 1,
		hunger: 50,
		hp: 100,
		currentFood: randomFood(),
		mustEat: false,
	};

	const message = await interaction.reply({
		embeds: [createEmbed(state)],
		components: createButtons(state),
		fetchReply: true,
	});

	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		time: 10 * 60 * 1000,
	});

	collector.on("collect", async (button) => {
		if (button.user.id !== interaction.user.id) {
			await button.reply({
				content: "あなたのゲームではありません。",
				ephemeral: true,
			});
			return;
		}

		if (button.customId === "eat") {
			const roll = Math.random() * 100;

			if (roll < state.currentFood.danger) {
				collector.stop();
				await button.deferUpdate();

				const currentRecord = await prisma.survivalRanking.findUnique({
					where: {
						userId: interaction.user.id,
					},
				});

				const newBest = Math.max(currentRecord?.bestDays ?? 0, state.day);

				// 現在のTOP10
				const top10 = await prisma.survivalRanking.findMany({
					orderBy: {
						bestDays: "desc",
					},
					take: 10,
				});

				// 10位
				const tenthPlace = top10[9];

				// TOP10が埋まっていて、10位以下なら保存しない
				if (
					top10.length >= 10 &&
					(!currentRecord || currentRecord.bestDays < newBest) &&
					newBest <= tenthPlace.bestDays
				) {
					return;
				}

				// 保存
				await prisma.survivalRanking.upsert({
					where: {
						userId: interaction.user.id,
					},
					update: {
						bestDays: newBest,
						username: interaction.user.username,
					},
					create: {
						userId: interaction.user.id,
						username: interaction.user.username,
						bestDays: newBest,
					},
				});

				// 11位以下を削除
				const ranking = await prisma.survivalRanking.findMany({
					orderBy: {
						bestDays: "desc",
					},
				});

				if (ranking.length > 10) {
					await prisma.survivalRanking.deleteMany({
						where: {
							userId: {
								in: ranking.slice(10).map((r) => r.userId),
							},
						},
					});
				}
				const rankings = await prisma.survivalRanking.findMany({
					select: {
						username: true,
						bestDays: true,
					},
					orderBy: {
						bestDays: "desc",
					},
					take: 15,
				});
				await button.editReply({
					embeds: [
						new EmbedBuilder()
							.setTitle("💀 GAME OVER")
							.setDescription(
								[
									`生存日数: ${state.day}`,
									"",
									`死因: ${state.currentFood.deathReason}`,
									`\n\n🏆ランキング🏆\n${rankings.map((r, i) => `${i + 1}. ${r.username} - ${r.bestDays}日`).join("\n")}`,
								].join("\n"),
							),
					],
					components: [],
				});

				return;
			}

			const hungerIncrease = calculateHungerIncrease();
			const hpIncrease = calculateHpIncrease();

			state.hunger = Math.min(state.hunger + hungerIncrease);
			state.hp = Math.min(state.hp + hpIncrease);
		}

		if (button.customId === "skip") {
			if (state.mustEat) {
				collector.stop();

				await button.deferUpdate();
				await button.editReply({
					embeds: [
						new EmbedBuilder()
							.setTitle("💀 GAME OVER")
							.setDescription(
								[
									`生存日数: ${state.day}`,
									"",
									state.hunger === 0 ? "死因: 餓死" : "死因: 体力切れ",
								].join("\n"),
							),
					],
					components: [],
				});

				return;
			}

			state.hunger -= 40;
			state.hp -= 40;
		}

		state.hunger = Math.max(0, state.hunger);
		state.hp = Math.max(0, state.hp);

		state.mustEat = state.hunger === 0 || state.hp === 0;

		state.day++;

		if (!state.mustEat) {
			const eventRoll = Math.random();

			if (eventRoll < 0.15) {
				state.hunger = Math.min(100, state.hunger + 50);
			} else if (eventRoll < 0.2) {
				state.hunger = Math.max(0, state.hunger - 30);
			}
		}

		state.currentFood = randomFood();

		await button.deferUpdate();
		await button.editReply({
			embeds: [createEmbed(state)],
			components: createButtons(state),
		});
	});
}
