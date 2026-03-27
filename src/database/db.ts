import dotenv from "dotenv";
import type { Pool } from "mysql2/promise";
import mysql from "mysql2/promise";

dotenv.config();

const pool: Pool = mysql.createPool({
	host: process.env.DB_HOST as string,
	port: Number(process.env.DB_PORT),
	user: process.env.DB_USER as string,
	password: process.env.DB_PASSWORD as string,
	database: process.env.DB_NAME as string,
	waitForConnections: true,
	connectionLimit: 5,
});

export default pool;
