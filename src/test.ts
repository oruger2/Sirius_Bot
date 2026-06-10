import prisma from "./database/db";

async function main() {
	const count = await prisma.survivalRanking.count();
	console.log(count);
}

main()
	.catch(console.error)
	.finally(async () => {
		await prisma.$disconnect();
	});
