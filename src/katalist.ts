import ky from "ky";
import pino from "pino";
import { jsonToZodSchema, writeZodSchema } from "./jsonToZodSchema";
import { transformHttpClientCall } from "./transformer";

type KatalistGeneratingSchemaOptions = {
	generateSchema?: boolean;
	interfaceName?: string;
	generateInputSchema?: boolean;
	inputInterfaceName?: string;
	headers?: Record<string, string>;
	sourceFile?: string;
};

type KatalistOptions = {
	debug?: boolean;
};

const createLogger = (debug: boolean) => {
	return pino({
		level: debug ? "debug" : "silent",
		transport: debug
			? {
					target: "pino-pretty",
					options: {
						colorize: true,
						ignore: "pid,hostname",
						translateTime: "SYS:HH:MM:ss",
					},
				}
			: undefined,
	});
};

const getCallerFilePath = (logger: pino.Logger): string | null => {
	try {
		const error = new Error();
		const stack = error.stack;

		logger.debug("Starting caller file detection...");

		if (!stack) {
			logger.debug("No stack trace available");
			return null;
		}

		const stackLines = stack.split("\n");
		logger.debug({ stackLines }, "Stack trace");

		for (const line of stackLines) {
			// Match file paths in stack trace format: "at functionName (/path/to/file.ts:line:col)"
			// Also handle file:// protocol: "at file:///path/to/file.ts:line:col"
			const fileMatch = line.match(/\(?((?:file:\/\/)?\/[^\s):]+\.(?:ts|js|tsx|jsx))/);
			if (fileMatch) {
				let filePath = fileMatch[1];
				logger.debug({ filePath }, "Found file in stack");

				if (filePath?.startsWith("file://")) {
					filePath = filePath.substring(7);
					logger.debug({ filePath }, "After removing file:// protocol");
				}

				if (!filePath) {
					logger.debug("filePath is empty, skipping");
					continue;
				}

				const normalizedPath = filePath.replace(/\\/g, "/");
				logger.debug({ normalizedPath }, "Normalized path");

				const isKatalistLibraryFile =
					normalizedPath.includes("/node_modules/katalist/") ||
					normalizedPath.endsWith("/katalist/src/katalist.ts") ||
					normalizedPath.includes("/katalist/dist/index.js") ||
					normalizedPath.includes("/katalist/dist/index.cjs");

				logger.debug({ isKatalistLibraryFile }, "Is katalist library file?");

				const isNodeModuleFile =
					normalizedPath.includes("/node_modules/") && !isKatalistLibraryFile;

				logger.debug({ isNodeModuleFile }, "Is node_modules file?");

				const isInternalLibrary =
					isKatalistLibraryFile ||
					isNodeModuleFile ||
					normalizedPath.includes("ts-morph");

				logger.debug({ isInternalLibrary }, "Is internal library?");

				if (filePath && !isInternalLibrary) {
					logger.debug({ filePath }, "✅ Selected caller file");
					return filePath;
				}

				logger.debug("Skipping this file, checking next...");
			}
		}

		logger.debug("❌ No caller file found");
	} catch (error) {
		logger.error({ error }, "Error during file path detection");
	}

	return null;
};

export const katalist = (config: KatalistOptions = {}) => {
	const logger = createLogger(config.debug ?? false);

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
			const autoDetectedFile = getCallerFilePath(logger);
			logger.debug({ autoDetectedFile }, "Auto-detected file");
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
							logger.debug(
								{ interfaceName: options.interfaceName },
								"Processing response for schema generation (GET)",
							);
							const json = await response.json();
							logger.debug(
								{
									isObject: typeof json === "object",
									isNull: json === null,
									isArray: Array.isArray(json),
								},
								"Response JSON analysis",
							);

							// Handle both objects and arrays
							if (typeof json === "object" && json !== null) {
								if (Array.isArray(json)) {
									if (json.length > 0 && typeof json[0] === "object") {
										logger.debug(
											{ arrayLength: json.length },
											"Response is array, generating array schema",
										);
										generateSchema(json, options.interfaceName);
									} else {
										logger.warn(
											{ arrayLength: json.length },
											"Array is empty or first element is not an object, skipping schema generation",
										);
										return;
									}
								} else {
									logger.debug("Response is object, generating object schema");
									generateSchema(
										json as Record<string, unknown>,
										options.interfaceName,
									);
								}
							} else {
								logger.warn(
									{ responseType: typeof json },
									"Response is not an object, skipping schema generation",
								);
							}

							// Automatically transform the source file after schema generation
							if (options.sourceFile) {
								try {
									logger.debug(
										{ sourceFile: options.sourceFile },
										"Starting transformation",
									);
									transformHttpClientCall(options.sourceFile, false);
									logger.debug(
										{ sourceFile: options.sourceFile },
										"✅ Transformation completed",
									);
								} catch (error) {
									logger.error({ error, sourceFile: options.sourceFile }, "❌ Transformation error");
								}
							}
						}
					},
				],
			},
			headers: options.headers,
		});
	};

	const post = <T>(
		url: string,
		data?: unknown,
		options: KatalistGeneratingSchemaOptions = {},
	) => {
		// Auto-detect source file if not provided and schema generation is enabled
		if (
			(options.generateSchema || options.generateInputSchema) &&
			!options.sourceFile
		) {
			const autoDetectedFile = getCallerFilePath(logger);
			logger.debug({ autoDetectedFile }, "Auto-detected file (POST)");
			if (autoDetectedFile) {
				options.sourceFile = autoDetectedFile;
			}
		}

		// Generate input schema if requested
		if (options.generateInputSchema && options.inputInterfaceName && data) {
			if (typeof data === "object" && data !== null && !Array.isArray(data)) {
				generateSchema(
					data as Record<string, unknown>,
					options.inputInterfaceName,
				);
			}
		}

		return ky.post<T>(url, {
			json: data,
			hooks: {
				afterResponse: [
					async (_, __, response) => {
						if (options.generateSchema && options.interfaceName) {
							const json = await response.json();
							if (
								typeof json === "object" &&
								json !== null &&
								!Array.isArray(json)
							) {
								generateSchema(
									json as Record<string, unknown>,
									options.interfaceName,
								);
							}
						}

						// Automatically transform the source file after schema generation
						if (options.sourceFile) {
							try {
								logger.debug(
									{ sourceFile: options.sourceFile },
									"Starting transformation (POST)",
								);
								transformHttpClientCall(options.sourceFile, false);
								logger.debug(
									{ sourceFile: options.sourceFile },
									"✅ Transformation completed (POST)",
								);
							} catch (error) {
								logger.error(
									{ error, sourceFile: options.sourceFile },
									"❌ Transformation error (POST)",
								);
							}
						}
					},
				],
			},
			headers: options.headers,
		});
	};

	const put = <T>(
		url: string,
		data?: unknown,
		options: KatalistGeneratingSchemaOptions = {},
	) => {
		// Auto-detect source file if not provided and schema generation is enabled
		if (
			(options.generateSchema || options.generateInputSchema) &&
			!options.sourceFile
		) {
			const autoDetectedFile = getCallerFilePath(logger);
			logger.debug({ autoDetectedFile }, "Auto-detected file (PUT)");
			if (autoDetectedFile) {
				options.sourceFile = autoDetectedFile;
			}
		}

		// Generate input schema if requested
		if (options.generateInputSchema && options.inputInterfaceName && data) {
			if (typeof data === "object" && data !== null && !Array.isArray(data)) {
				generateSchema(
					data as Record<string, unknown>,
					options.inputInterfaceName,
				);
			}
		}

		return ky.put<T>(url, {
			json: data,
			hooks: {
				afterResponse: [
					async (_, __, response) => {
						if (options.generateSchema && options.interfaceName) {
							const json = await response.json();
							if (
								typeof json === "object" &&
								json !== null &&
								!Array.isArray(json)
							) {
								generateSchema(
									json as Record<string, unknown>,
									options.interfaceName,
								);
							}
						}

						// Automatically transform the source file after schema generation
						if (options.sourceFile) {
							try {
								logger.debug(
									{ sourceFile: options.sourceFile },
									"Starting transformation (PUT)",
								);
								transformHttpClientCall(options.sourceFile, false);
								logger.debug(
									{ sourceFile: options.sourceFile },
									"✅ Transformation completed (PUT)",
								);
							} catch (error) {
								logger.error(
									{ error, sourceFile: options.sourceFile },
									"❌ Transformation error (PUT)",
								);
							}
						}
					},
				],
			},
			headers: options.headers,
		});
	};

	const del = <T>(
		url: string,
		options: KatalistGeneratingSchemaOptions = {},
	) => {
		// Auto-detect source file if not provided and schema generation is enabled
		if (
			options.generateSchema &&
			options.interfaceName &&
			!options.sourceFile
		) {
			const autoDetectedFile = getCallerFilePath(logger);
			logger.debug({ autoDetectedFile }, "Auto-detected file (DELETE)");
			if (autoDetectedFile) {
				options.sourceFile = autoDetectedFile;
			}
		}

		return ky.delete<T>(url, {
			hooks: {
				afterResponse: [
					async (_, __, response) => {
						if (options.generateSchema && options.interfaceName) {
							const json = await response.json();
							if (
								typeof json === "object" &&
								json !== null &&
								!Array.isArray(json)
							) {
								generateSchema(
									json as Record<string, unknown>,
									options.interfaceName,
								);
							}
						}

						// Automatically transform the source file after schema generation
						if (options.sourceFile) {
							try {
								logger.debug(
									{ sourceFile: options.sourceFile },
									"Starting transformation (DELETE)",
								);
								transformHttpClientCall(options.sourceFile, false);
								logger.debug(
									{ sourceFile: options.sourceFile },
									"✅ Transformation completed (DELETE)",
								);
							} catch (error) {
								logger.error(
									{ error, sourceFile: options.sourceFile },
									"❌ Transformation error (DELETE)",
								);
							}
						}
					},
				],
			},
			headers: options.headers,
		});
	};

	const generateSchema = (
		data: Record<string, unknown> | Array<unknown>,
		interfaceName: string,
	) => {
		const isArray = Array.isArray(data);
		logger.debug(
			{
				interfaceName,
				isArray,
				dataKeys: isArray ? Object.keys(data[0] || {}) : Object.keys(data),
			},
			"Generating schema",
		);
		const zodSchema = jsonToZodSchema(data, interfaceName);

		const schemaPath = `./http-schemas/${interfaceName}.ts`;
		logger.debug({ schemaPath, cwd: process.cwd() }, "Writing schema file");

		writeZodSchema(zodSchema, interfaceName, schemaPath);

		logger.debug({ schemaPath }, "✅ Schema file written");
	};

	return {
		get,
		post,
		put,
		delete: del,
	};
};
