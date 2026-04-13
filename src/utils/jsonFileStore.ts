import { existsSync } from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const JSON_DATA_DIR_CANDIDATES = [
	path.join(process.cwd(), "src/json"),
	path.join(process.cwd(), "dist/json"),
	path.join(process.cwd(), "json"),
];

const resolveJsonDataDir = () => {
	for (const dir of JSON_DATA_DIR_CANDIDATES) {
		if (existsSync(dir)) {
			return dir;
		}
	}

	return JSON_DATA_DIR_CANDIDATES[0];
};

const JSON_DATA_DIR = resolveJsonDataDir();

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
	typeof error === "object" && error !== null && "code" in error;

const toFilePath = (fileName: string) => path.join(JSON_DATA_DIR, fileName);

export const ensureJsonDataDir = async () => {
	await fsp.mkdir(JSON_DATA_DIR, { recursive: true });
};

export const readJsonData = async <T>(
	fileName: string,
	fallback: T,
): Promise<T> => {
	const filePath = toFilePath(fileName);

	try {
		const raw = await fsp.readFile(filePath, "utf8");
		return JSON.parse(raw) as T;
	} catch (error: unknown) {
		if (isErrnoException(error) && error.code === "ENOENT") {
			return fallback;
		}

		if (error instanceof SyntaxError) {
			console.warn(
				`⚠️ JSONの構文が不正なため既定値を使用: ${filePath} (${error.message})`,
			);
			return fallback;
		}

		throw error;
	}
};

export const writeJsonData = async (fileName: string, data: unknown) => {
	await ensureJsonDataDir();
	await fsp.writeFile(toFilePath(fileName), JSON.stringify(data, null, 2));
};
