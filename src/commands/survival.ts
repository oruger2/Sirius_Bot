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
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiDmaEov0m16Xq-gZ2Xb2hG-C2W34l-W_XQ6-6rEwreN_Y_vG8F64fX8jFqgWw_ZfLp9n5X_Wz4/s800/bunbougu_keikoupen.png",
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
		danger: 32,
		deathReason: "ボディソープで胃が綺麗になりすぎた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjN0W-t0B67qX5O5H1b6E1yD4Z8t3gN8b-Uv8X8/s800/bodysoap.png",
	},
	{
		name: "歯磨き粉",
		danger: 28,
		deathReason: "歯磨き粉で口がスースーしすぎた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEisb7yq4V2gq1K9X3Xw4l-g/s800/hamigakiko.png",
	},
	{
		name: "トイレットペーパー",
		danger: 16,
		deathReason: "トイレットペーパーが喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhO5C6W9V4l8r9b6R4d2b-g/s800/toiletpaper.png",
	},
	{
		name: "スポンジ",
		danger: 25,
		deathReason: "スポンジが胃液を全部吸い取った",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjb6F9y7X4t2b-g/s800/sponge.png",
	},
	{
		name: "たわし",
		danger: 29,
		deathReason: "たわしで喉が傷だらけになった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjy3R4d2b-g/s800/tawashi.png",
	},
	{
		name: "雑巾",
		danger: 33,
		deathReason: "雑巾の汚れで感染症になった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiz3R4d2b-g/s800/zoukin.png",
	},
	{
		name: "画鋲",
		danger: 45,
		deathReason: "画鋲が胃に刺さった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiy5R4d2b-g/s800/gabyou.png",
	},
	{
		name: "クリップ",
		danger: 38,
		deathReason: "クリップが喉に引っかかった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjx5R4d2b-g/s800/clip.png",
	},
	{
		name: "ホッチキスの芯",
		danger: 42,
		deathReason: "ホッチキスの芯が刺さった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiw5R4d2b-g/s800/hotchkiss_sin.png",
	},
	{
		name: "安全ピン",
		danger: 46,
		deathReason: "安全ピンが安全じゃなかった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjv5R4d2b-g/s800/anzen_pin.png",
	},
	{
		name: "釘",
		danger: 55,
		deathReason: "釘が胃を貫通した",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEju5R4d2b-g/s800/kugi.png",
	},
	{
		name: "ネジ",
		danger: 52,
		deathReason: "ネジが胃に刺さった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjt5R4d2b-g/s800/neji.png",
	},
	{
		name: "ボルト",
		danger: 50,
		deathReason: "ボルトが胃に刺さった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjs5R4d2b-g/s800/bolt.png",
	},
	{
		name: "ナット",
		danger: 48,
		deathReason: "ナットが喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjr5R4d2b-g/s800/nut.png",
	},
	{
		name: "ワッシャー",
		danger: 44,
		deathReason: "ワッシャーが喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjq5R4d2b-g/s800/washer.png",
	},
	{
		name: "画用紙",
		danger: 17,
		deathReason: "画用紙が喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjp5R4d2b-g/s800/gayoushi.png",
	},
	{
		name: "折り紙",
		danger: 16,
		deathReason: "折り紙が喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjo5R4d2b-g/s800/origami.png",
	},
	{
		name: "新聞紙",
		danger: 18,
		deathReason: "新聞紙のインクで中毒になった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjn5R4d2b-g/s800/sinbunshi.png",
	},
	{
		name: "雑誌",
		danger: 19,
		deathReason: "雑誌が喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjm5R4d2b-g/s800/zasshi.png",
	},
	{
		name: "チラシ",
		danger: 18,
		deathReason: "チラシが喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjl5R4d2b-g/s800/tirasi.png",
	},
	{
		name: "パンフレット",
		danger: 19,
		deathReason: "パンフレットが喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjk5R4d2b-g/s800/pamphlet.png",
	},
	{
		name: "カタログ",
		danger: 20,
		deathReason: "カタログが喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjj5R4d2b-g/s800/catalog.png",
	},
	{
		name: "ポスター",
		danger: 21,
		deathReason: "ポスターが喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEji5R4d2b-g/s800/poster.png",
	},
	{
		name: "カレンダー",
		danger: 22,
		deathReason: "カレンダーが喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjh5R4d2b-g/s800/calendar.png",
	},
	{
		name: "手帳",
		danger: 23,
		deathReason: "手帳が喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjg5R4d2b-g/s800/techou.png",
	},
	{
		name: "ノート",
		danger: 24,
		deathReason: "ノートが喉に詰まった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjf5R4d2b-g/s800/notebook.png",
	},
	{
		name: "砂",
		danger: 25,
		deathReason: "砂を食べた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEje5R4d2b-g/s800/suna.png",
	},
	{
		name: "泥",
		danger: 27,
		deathReason: "泥を食べた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjd5R4d2b-g/s800/doro.png",
	},
	{
		name: "石",
		danger: 35,
		deathReason: "石を食べた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjc5R4d2b-g/s800/ishi.png",
	},
	{
		name: "泥団子",
		danger: 29,
		deathReason: "泥団子を食べた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjb5R4d2b-g/s800/dorodango.png",
	},
	{
		name: "レンガの欠片",
		danger: 64,
		deathReason: "レンガの破片で口の中が傷だらけになった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEja5R4d2b-g/s800/renga.png",
	},
	{
		name: "自転車",
		danger: 71,
		deathReason: "自転車を食べようとして顎が壊れた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiZ5R4d2b-g/s800/jitensha.png",
	},
	{
		name: "原付",
		danger: 72,
		deathReason: "原付を食べようとして潰された",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiY5R4d2b-g/s800/gentsuki.png",
	},
	{
		name: "バイク",
		danger: 73,
		deathReason: "バイクを飲み込もうとした",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiX5R4d2b-g/s800/bike.png",
	},
	{
		name: "軽自動車",
		danger: 74,
		deathReason: "軽自動車を食べるのは無理だった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiW5R4d2b-g/s800/keijidousha.png",
	},
	{
		name: "普通車",
		danger: 75,
		deathReason: "車を噛んだ瞬間に敗北した",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiV5R4d2b-g/s800/car.png",
	},
	{
		name: "トラック",
		danger: 76,
		deathReason: "トラックに返り討ちにされた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiU5R4d2b-g/s800/truck.png",
	},
	{
		name: "電車",
		danger: 77,
		deathReason: "電車を食べようとした結果だった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiT5R4d2b-g/s800/train.png",
	},
	{
		name: "冷蔵庫",
		danger: 78,
		deathReason: "冷蔵庫が大きすぎた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiS5R4d2b-g/s800/reizouko.png",
	},
	{
		name: "洗濯機",
		danger: 79,
		deathReason: "洗濯機を食べる前に力尽きた",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiR5R4d2b-g/s800/sentakuki.png",
	},
	{
		name: "一戸建て住宅",
		danger: 80,
		deathReason: "家は食べ物ではなかった",
		image:
			"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiQ5R4d2b-g/s800/house.png",
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

const command = {
	data: new SlashCommandBuilder()
		.setName("survival")
		.setDescription("サバイバルゲーム開始"),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.deferred && !interaction.replied) {
			try {
				await interaction.deferReply();
			} catch {
				// デファー失敗時はそのままフォールバック
			}
		}

		const state: GameState = {
			day: 1,
			hunger: 50,
			hp: 100,
			currentFood: randomFood(),
			mustEat: false,
		};

		const message = await interaction.editReply({
			embeds: [createEmbed(state)],
			components: createButtons(state),
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

					// 現在のTOP10を取得
					const top10 = await prisma.survivalRanking.findMany({
						orderBy: {
							bestDays: "desc",
						},
						take: 10,
					});

					const tenthPlace = top10[9];

					const shouldUpdateLeaderboard = !(
						top10.length >= 10 &&
						(!currentRecord || currentRecord.bestDays < newBest) &&
						tenthPlace &&
						newBest <= tenthPlace.bestDays
					);

					// 保存
					if (shouldUpdateLeaderboard) {
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
								updatedAt: new Date(),
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

				state.hunger = Math.min(state.hunger + hungerIncrease, 100);
				state.hp = Math.min(state.hp + hpIncrease, 100);
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
	},
};

export default command;
