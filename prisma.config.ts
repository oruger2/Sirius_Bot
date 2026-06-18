import "dotenv/config";
import { defineConfig } from "prisma/config";

const buildDatabaseUrl = () => {
	const databaseUrl = process.env.DATABASE_URL;
	if (databaseUrl) return databaseUrl;

	const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT } = process.env;
	if (DB_HOST && DB_USER && DB_PASSWORD && DB_NAME && DB_PORT) {
		const user = encodeURIComponent(DB_USER);
		const password = encodeURIComponent(DB_PASSWORD);
		const database = encodeURIComponent(DB_NAME);
		return `mysql://${user}:${password}@${DB_HOST}:${DB_PORT}/${database}`;
	}

	return "mysql://user:password@localhost:3306/database";
};

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: buildDatabaseUrl(),
	},
});
