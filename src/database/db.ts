import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma";

const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;
const DB_PORT = process.env.DB_PORT;
const DB_CA_PATH = path.join(process.cwd(), "src", "certs", "isrgrootx1.pem");
const caExists = fs.existsSync(DB_CA_PATH);

if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME || !DB_PORT || !caExists) {
	const missingEnvVars = [];
	if (!DB_HOST) missingEnvVars.push("DB_HOST");
	if (!DB_USER) missingEnvVars.push("DB_USER");
	if (!DB_PASSWORD) missingEnvVars.push("DB_PASSWORD");
	if (!DB_NAME) missingEnvVars.push("DB_NAME");
	if (!DB_PORT) missingEnvVars.push("DB_PORT");

	const errors = [];
	if (missingEnvVars.length > 0) {
		errors.push(
			`Missing required database environment variables: ${missingEnvVars.join(", ")}`,
		);
	}
	if (!caExists) {
		errors.push(`Missing DB_CA_PATH file: ${DB_CA_PATH}`);
	}

	throw new Error(errors.join("; "));
}

const port = Number.parseInt(DB_PORT, 10);
if (!Number.isFinite(port) || port < 1 || port > 65535) {
	throw new Error(
		`Invalid DB_PORT: must be a valid port number between 1 and 65535, got "${DB_PORT}"`,
	);
}

const adapter = new PrismaMariaDb({
	host: DB_HOST,
	port,
	user: DB_USER,
	password: DB_PASSWORD,
	database: DB_NAME,
	ssl: {
		ca: fs.readFileSync(DB_CA_PATH, "utf8"),
		rejectUnauthorized: true,
	},
});

export const prisma = new PrismaClient({
	adapter,
});

export default prisma;
