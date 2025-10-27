import ky from "ky";
import { jsonToZodSchema, writeZodSchema } from "./jsonToZodSchema";
import { transformHttpClientCall } from "./transformer";

type KatalistGeneratingSchemaOptions = {
	generateSchema?: boolean;
	interfaceName?: string;
	headers?: Record<string, string>;
	sourceFile?: string;
};

/**
 * Automatically detects the file path where this function is called from
 * by parsing the Error stack trace.
 */
const getCallerFilePath = (): string | null => {
	try {
		// Create an error to get the stack trace
		const error = new Error();
		const stack = error.stack;

		if (!stack) return null;

		// Parse the stack trace to find the caller file
		const stackLines = stack.split("\n");

		// Find the first line that contains a file path from outside the katalist library
		for (const line of stackLines) {
			// Look for lines that contain file paths (ending with .ts or .js)
			// Match file:// protocol or direct paths, but avoid capturing extra characters
			const fileMatch = line.match(/((?:file:\/\/)?[^\s]+\.(?:ts|js|tsx|jsx))/);
			if (fileMatch) {
				let filePath = fileMatch[1];
				// Remove file:// protocol if present
				if (filePath && filePath.startsWith("file://")) {
					filePath = filePath.substring(7);
				}
				// Skip files from node_modules and the current katalist library files
				if (
					filePath &&
					!filePath.includes("node_modules") &&
					!filePath.includes("katalist") &&
					!filePath.includes("ts-morph") &&
					!filePath.includes("ky")
				) {
					// Return the absolute path
					return filePath;
				}
			}
		}
	} catch (_error) {
		// Silently ignore errors in file path detection
	}

	return null;
};

export const katalist = () => {
	const get = <T>(
		url: string,
		options: KatalistGeneratingSchemaOptions = {},
	) => {
		// Auto-detect source file if not provided and schema generation is enabled
		if (
			options.generateSchema &&
			options.interfaceName &&
			!options.sourceFile
		) {
			const autoDetectedFile = getCallerFilePath();
			if (autoDetectedFile) {
				options.sourceFile = autoDetectedFile;
			}
		}

		return ky.get<T>(url, {
			hooks: {
				// beforeRequest: [beforeRequestHook],
				afterResponse: [
					async (_, __, response) => {
						if (options.generateSchema && options.interfaceName) {
							const json = await response.json();
							if (
								typeof json === "object" &&
								json !== null &&
								!Array.isArray(json)
							) {
								generateOutputSchema(
									json as Record<string, unknown>,
									options.interfaceName,
								);
							}

							// Automatically transform the source file after schema generation
							if (options.sourceFile) {
								try {
									transformHttpClientCall(options.sourceFile, false);
								} catch (_error) {
									// Silently ignore transformation errors during runtime
								}
							}
						}
					},
				],
			},
			headers: options.headers,
		});
	};

	const generateOutputSchema = (
		output: Record<string, unknown>,
		interfaceName: string,
	) => {
		const zodSchema = jsonToZodSchema(output, interfaceName);

		writeZodSchema(
			zodSchema,
			interfaceName,
			`./http-schemas/${interfaceName}.ts`,
		);
	};

	return {
		get,
	};
};
