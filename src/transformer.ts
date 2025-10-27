import { dirname, join, relative } from "node:path";
import { Biome } from "@biomejs/js-api/nodejs";
import { write } from "bun";
import {
	type CallExpression,
	Node,
	Project,
	type PropertyAssignment,
	type SourceFile,
	SyntaxKind,
} from "ts-morph";

/**
 * Type definition for HTTP client variable information
 */
interface HttpClientInfo {
	/** The type name extracted from the zodOutput schema */
	typeName: string;
	/** The name of the function containing the HTTP client */
	functionName: string;
}

/**
 * Transforms a TypeScript source file by processing HTTP client calls and adding type information.
 *
 * This function performs the following operations:
 * 1. Adds type parameters to HTTP client method calls
 * 2. Removes zodOutput properties from HTTP client constructors
 * 3. Adds necessary schema type imports
 * 4. Formats the code using Biome
 *
 * @param sourceFilePath - The path to the source TypeScript file to transform
 * @param addTransformFilePath - If true, creates a new file with '.transformed.ts' suffix. If false, overwrites the original file
 * @param functionNames - Optional array of function names to process. If provided, only these functions will be processed
 * @returns The formatted transformed code as a string
 *
 * @example
 * ```typescript
 * // Transform and create a new file
 * const result = transformHttpClientCall('./src/api.ts', true);
 *
 * // Transform and overwrite original file
 * const result = transformHttpClientCall('./src/api.ts', false);
 *
 * // Transform only specific functions
 * const result = transformHttpClientCall('./src/api.ts', true, ['getFiltrosEmendas']);
 * ```
 */
export const transformHttpClientCall = (
	sourceFilePath: string,
	addTransformFilePath = true,
	_functionNames?: string[],
): string => {
	const project = new Project();
	project.addSourceFileAtPath(sourceFilePath);
	const sourceFile = project.getSourceFileOrThrow(sourceFilePath);

	// For katalist calls: add type parameters, then clean up schema generation options
	addTypeParametersToKatalistCalls(sourceFile);
	addKatalistSchemaImports(sourceFile);
	removeZodOutput(sourceFile);
	removeSchemaGenerationOptions(sourceFile);

	const formatted = formatWithBiome(sourceFile);

	if (addTransformFilePath) {
		const transformedPath = sourceFilePath.replace(".ts", ".transformed.ts");
		write(transformedPath, formatted);
		return formatted;
	}

	write(sourceFilePath, formatted);
	return formatted;
};

/**
 * Finds all HTTP client constructor calls that have a zodOutput property.
 *
 * This function searches through the source file for 'new HttpClient()' expressions
 * and filters them to only include those that have a zodOutput property in their
 * constructor arguments.
 *
 * @param sourceFile - The TypeScript source file to search in
 * @returns An array of NewExpression nodes representing HTTP client constructors with zodOutput
 *
 * @example
 * ```typescript
 * const httpClientCalls = findHttpClientCallsWithZodOutput(sourceFile);
 * console.log(`Found ${httpClientCalls.length} HTTP client calls with zodOutput`);
 * ```
 */
export const findHttpClientCallsWithZodOutput = (sourceFile: SourceFile) => {
	return sourceFile
		.getDescendantsOfKind(SyntaxKind.NewExpression)
		.filter((newExpr) => {
			const expression = newExpr.getExpression();
			return (
				expression.getText() === "HttpClient" &&
				newExpr.getArguments().some((arg) => {
					return (
						Node.isObjectLiteralExpression(arg) && arg.getProperty("zodOutput")
					);
				})
			);
		});
};

/**
 * Finds all katalist get() calls that have generateSchema and interfaceName properties.
 *
 * This function searches through the source file for '.get()' expressions
 * and filters them to only include those that have generateSchema and interfaceName
 * properties in their options.
 *
 * @param sourceFile - The TypeScript source file to search in
 * @returns An array of CallExpression nodes representing katalist get() calls with schema generation
 *
 * @example
 * ```typescript
 * const katalistCalls = findKatalistCallsWithSchemaGeneration(sourceFile);
 * console.log(`Found ${katalistCalls.length} katalist calls with schema generation`);
 * ```
 */
export const findKatalistCallsWithSchemaGeneration = (
	sourceFile: SourceFile,
) => {
	return sourceFile
		.getDescendantsOfKind(SyntaxKind.CallExpression)
		.filter((callExpr) => {
			const expression = callExpr.getExpression();
			if (!Node.isPropertyAccessExpression(expression)) {
				return false;
			}

			const propertyName = expression.getName();

			// Check if it's a .get() call
			if (propertyName !== "get") {
				return false;
			}

			// Check if it has the required properties in options
			const args = callExpr.getArguments();
			if (args.length < 2) {
				return false;
			}

			const optionsArg = args[1];
			if (!Node.isObjectLiteralExpression(optionsArg)) {
				return false;
			}

			const generateSchemaProp = optionsArg.getProperty("generateSchema");
			const interfaceNameProp = optionsArg.getProperty("interfaceName");

			return Boolean(generateSchemaProp && interfaceNameProp);
		});
};

/**
 * Removes zodOutput and forceFileTransform properties from HTTP client constructor calls.
 *
 * This function processes all HTTP client constructors that have zodOutput properties
 * and removes both the zodOutput and forceFileTransform properties from their
 * constructor arguments. This is typically done after the type information has been
 * extracted and added to method calls.
 *
 * @param sourceFile - The TypeScript source file to process
 * @returns The formatted code after removing the properties
 *
 * @example
 * ```typescript
 * // Before: new HttpClient({ zodOutput: { schemaName: 'User' }, forceFileTransform: true })
 * // After:  new HttpClient({ })
 * const formatted = removeZodOutput(sourceFile);
 * ```
 */
export const removeZodOutput = (sourceFile: SourceFile): string => {
	const httpClientConstructorCalls =
		findHttpClientCallsWithZodOutput(sourceFile);

	for (const call of httpClientConstructorCalls) {
		const args = call.getArguments();
		for (const arg of args) {
			if (Node.isObjectLiteralExpression(arg)) {
				const zodOutputProperty = arg.getProperty("zodOutput");
				const forceFileTransformProperty =
					arg.getProperty("forceFileTransform");

				if (zodOutputProperty) {
					zodOutputProperty.remove();
					forceFileTransformProperty?.remove();
				}
			}
		}
	}

	return formatWithBiome(sourceFile);
};

/**
 * Removes generateSchema and interfaceName properties from katalist get() calls.
 *
 * This function processes all katalist get() calls that have generateSchema and interfaceName
 * properties and removes both properties from their options. This is typically done
 * after the schema generation has been completed and the types have been added.
 *
 * @param sourceFile - The TypeScript source file to process
 * @returns The formatted code after removing the properties
 *
 * @example
 * ```typescript
 * // Before: kat.get(url, { generateSchema: true, interfaceName: "User", headers: {} })
 * // After:  kat.get(url, { headers: {} })
 * const formatted = removeSchemaGenerationOptions(sourceFile);
 * ```
 */
/**
 * Adds type parameters to katalist get() calls based on the interfaceName property.
 *
 * This function processes katalist get() calls that have interfaceName in their options
 * and adds the appropriate type parameter to the method call.
 *
 * @param sourceFile - The TypeScript source file to process
 *
 * @example
 * ```typescript
 * // Before: kat.get(url, { interfaceName: "User" })
 * // After:  kat.get<UserSchemaType>(url, { interfaceName: "User" })
 * addTypeParametersToKatalistCalls(sourceFile);
 * ```
 */
export const addTypeParametersToKatalistCalls = (
	sourceFile: SourceFile,
): void => {
	const katalistCalls = findKatalistCallsWithSchemaGeneration(sourceFile);

	for (const callExpr of katalistCalls) {
		const expression = callExpr.getExpression();
		if (!Node.isPropertyAccessExpression(expression)) {
			continue;
		}

		// Check if type arguments are already present
		const typeArguments = callExpr.getTypeArguments();
		if (typeArguments.length > 0) {
			continue; // Already has type parameters
		}

		// Get the interfaceName from options
		const args = callExpr.getArguments();
		if (args.length >= 2) {
			const optionsArg = args[1];
			if (Node.isObjectLiteralExpression(optionsArg)) {
				const interfaceNameProperty = optionsArg.getProperty("interfaceName");
				if (
					interfaceNameProperty &&
					Node.isPropertyAssignment(interfaceNameProperty)
				) {
					const interfaceNameInitializer =
						interfaceNameProperty.getInitializer();
					if (Node.isStringLiteral(interfaceNameInitializer)) {
						const interfaceName = interfaceNameInitializer.getLiteralValue();
						const typeName = `${interfaceName}SchemaType`;

						// Add type parameter to the call
						const callText = callExpr.getText();
						// Handle both formatted and unformatted calls
						const newCallText = callText.replace(
							/\.get\(/,
							`.get<${typeName}>(`,
						);

						callExpr.replaceWithText(newCallText);
					}
				}
			}
		}
	}
};

export const removeSchemaGenerationOptions = (
	sourceFile: SourceFile,
): string => {
	const katalistCalls = findKatalistCallsWithSchemaGeneration(sourceFile);

	for (const call of katalistCalls) {
		const args = call.getArguments();
		if (args.length >= 2) {
			const optionsArg = args[1];
			if (Node.isObjectLiteralExpression(optionsArg)) {
				const generateSchemaProperty = optionsArg.getProperty("generateSchema");
				const interfaceNameProperty = optionsArg.getProperty("interfaceName");
				const sourceFileProperty = optionsArg.getProperty("sourceFile");

				if (generateSchemaProperty) {
					generateSchemaProperty.remove();
				}
				if (interfaceNameProperty) {
					interfaceNameProperty.remove();
				}
				if (sourceFileProperty) {
					sourceFileProperty.remove();
				}
			}
		}
	}

	return formatWithBiome(sourceFile);
};

/**
 * Finds all references to 'HttpClient' identifiers in the source file.
 *
 * This function searches for all identifier nodes that have the text 'HttpClient',
 * which could be used in various contexts like type annotations, imports, etc.
 *
 * @param sourceFile - The TypeScript source file to search in
 * @returns An array of Identifier nodes representing HttpClient references
 *f
 * @example
 * ```typescript
 * const httpClientRefs = findHttpClientsReferences(sourceFile);
 * console.log(`Found ${httpClientRefs.length} HttpClient references`);
 * ```
 */
export const findHttpClientsReferences = (sourceFile: SourceFile) => {
	return sourceFile
		.getDescendantsOfKind(SyntaxKind.Identifier)
		.filter((identifier) => identifier.getText() === "HttpClient");
};

/**
 * Formats TypeScript code using Biome formatter.
 *
 * This function uses the Biome API to format the provided source file content
 * according to the project's Biome configuration. It opens the project and
 * formats the content with the appropriate file path context.
 *
 * @param sourceFile - The TypeScript source file to format
 * @returns The formatted code as a string
 *
 * @example
 * ```typescript
 * const formatted = formatWithBiome(sourceFile);
 * console.log('Code formatted successfully');
 * ```
 */
export const formatWithBiome = (sourceFile: SourceFile): string => {
	const biome = new Biome();
	const { projectKey } = biome.openProject("../../");

	const formatted = biome.formatContent(projectKey, sourceFile.getText(), {
		filePath: sourceFile.getFilePath(),
	});

	return formatted.content;
};

/**
 * Extracts the schema name from a zodOutput property and constructs the output type name.
 *
 * This function parses the zodOutput property structure to find the schemaName
 * and constructs the corresponding output type name by appending 'OutputSchemaType'.
 *
 * @param zodOutputProperty - The PropertyAssignment node representing the zodOutput property
 * @returns The constructed type name (e.g., 'UserOutputSchemaType') or null if extraction fails
 *
 * @example
 * ```typescript
 * // For zodOutput: { schemaName: 'User' }
 * // Returns: 'UserOutputSchemaType'
 * const typeName = extractSchemaNameFromZodOutput(zodOutputProperty);
 * ```
 */
export const extractSchemaNameFromZodOutput = (
	zodOutputProperty: PropertyAssignment,
): string | null => {
	const initializer = zodOutputProperty.getInitializer();
	if (!Node.isObjectLiteralExpression(initializer)) {
		return null;
	}

	const schemaNameProperty = initializer.getProperty("schemaName");
	if (!(schemaNameProperty && Node.isPropertyAssignment(schemaNameProperty))) {
		return null;
	}

	const schemaNameInitializer = schemaNameProperty.getInitializer();
	if (!Node.isStringLiteral(schemaNameInitializer)) {
		return null;
	}

	const schemaName = schemaNameInitializer.getLiteralValue();
	return `${schemaName}OutputSchemaType`;
};

/**
 * Finds the containing function name for a given node.
 *
 * @param node - The node to find the containing function for
 * @returns The function name or 'anonymous' if no name found, or 'global' if no function found
 */
/**
 * Checks if a variable declaration contains a function (arrow function or function expression).
 */
const isFunctionVariableDeclaration = (node: Node): boolean => {
	if (!Node.isVariableDeclaration(node)) {
		return false;
	}

	const initializer = node.getInitializer();
	return Boolean(
		initializer &&
			(Node.isArrowFunction(initializer) ||
				Node.isFunctionExpression(initializer)),
	);
};

/**
 * Gets the name from a node that might be a variable declaration.
 */
const getNodeName = (node: Node): string => {
	if (Node.isVariableDeclaration(node)) {
		return node.getName() || "anonymous";
	}
	if (Node.isFunctionDeclaration(node)) {
		return node.getName() || "anonymous";
	}
	if (Node.isFunctionExpression(node)) {
		return node.getName() || "anonymous";
	}
	return "anonymous";
};

const findContainingFunctionName = (node: Node): string => {
	let current = node.getParent();

	while (current) {
		if (
			Node.isFunctionDeclaration(current) ||
			Node.isFunctionExpression(current)
		) {
			return getNodeName(current);
		}

		if (Node.isArrowFunction(current)) {
			const parent = current.getParent();
			if (Node.isVariableDeclaration(parent)) {
				return getNodeName(parent);
			}
			return "anonymous";
		}

		if (isFunctionVariableDeclaration(current)) {
			return getNodeName(current);
		}

		current = current.getParent();
	}

	return "global";
};

/**
 * Extracts type information from HTTP client constructor arguments.
 *
 * @param args - The arguments of the HTTP client constructor
 * @returns The extracted type name or null if not found
 */
const extractTypeFromHttpClientArgs = (args: Node[]): string | null => {
	for (const arg of args) {
		if (!Node.isObjectLiteralExpression(arg)) {
			continue;
		}

		const zodOutputProperty = arg.getProperty("zodOutput");
		if (zodOutputProperty && Node.isPropertyAssignment(zodOutputProperty)) {
			return extractSchemaNameFromZodOutput(zodOutputProperty);
		}
	}
	return null;
};

/**
 * Calculates the relative path from the source file to the http-schemas directory.
 *
 * This function determines the correct relative path from any file location
 * in the project to the http-schemas directory at the root level.
 *
 * @param sourceFilePath - The absolute path of the source file
 * @returns The relative path to the http-schemas directory
 *
 * @example
 * ```typescript
 * // From src/core/transformer.ts -> '../../http-schemas'
 * // From src/portal/api.ts -> '../../http-schemas'
 * // From e2e/test.ts -> '../http-schemas'
 * const relativePath = calculateHttpSchemasPath('/project/src/core/transformer.ts');
 * ```
 */
const calculateHttpSchemasPath = (sourceFilePath: string): string => {
	// Get the directory of the source file
	const sourceDir = dirname(sourceFilePath);

	// Calculate relative path from source directory to project root
	// We need to go up to the root where http-schemas is located
	const relativeToRoot = relative(sourceDir, process.cwd());

	// Construct the path to http-schemas
	const httpSchemasPath = join(relativeToRoot, "http-schemas");

	// Normalize the path (remove any '..' at the beginning if we're already at root)
	return httpSchemasPath.startsWith("..")
		? httpSchemasPath
		: `./${httpSchemasPath}`;
};

/**
 * Extracts HTTP client variables that have zodOutput properties and maps them to their type information.
 *
 * This function finds all HTTP client constructor calls with zodOutput properties,
 * determines the variable names they're assigned to, finds the containing functions,
 * and creates a mapping using a combination of variable name and function name as the key.
 *
 * @param sourceFile - The TypeScript source file to analyze
 * @returns A Map where keys are "variableName:functionName" and values contain type information
 *
 * @example
 * ```typescript
 * const httpClientMap = extractHttpClientVariablesWithZodOutput(sourceFile);
 * // Map { 'httpClient:getEmendas' => { typeName: 'EmendasListOutputSchemaType', functionName: 'getEmendas' } }
 * ```
 */
export const extractHttpClientVariablesWithZodOutput = (
	sourceFile: SourceFile,
	functionNames?: string[],
): Map<string, HttpClientInfo> => {
	const httpClientCalls = findHttpClientCallsWithZodOutput(sourceFile);
	const httpClientToTypeMap = new Map<string, HttpClientInfo>();
	let processedFirstFunction = false;

	for (const call of httpClientCalls) {
		const parent = call.getParent();
		if (!Node.isVariableDeclaration(parent)) {
			continue;
		}

		const variableName = parent.getName();
		const functionName = findContainingFunctionName(parent);

		// If functionNames is provided, only process those specific functions
		// If the detected function name is 'anonymous', only process the first function found
		if (
			functionNames &&
			functionNames.length > 0 &&
			!functionNames.includes(functionName) &&
			!functionNames.includes("<anonymous>")
		) {
			continue;
		}

		// If we're processing anonymous and this isn't the first function, skip it
		if (functionNames?.includes("<anonymous>") && processedFirstFunction) {
			continue;
		}

		const typeName = extractTypeFromHttpClientArgs(call.getArguments());

		if (typeName) {
			// Use a combination of variable name and function name as the key
			const key = `${variableName}:${functionName}`;
			httpClientToTypeMap.set(key, { typeName, functionName });
			processedFirstFunction = true;
		}
	}

	return httpClientToTypeMap;
};

/**
 * Finds all HTTP client method calls (get, post, put, delete) in the source file.
 *
 * This function searches for call expressions where the object is an identifier
 * that has been declared as an HttpClient instance and the property is one of the HTTP methods.
 *
 * @param sourceFile - The TypeScript source file to search in
 * @returns An array of CallExpression nodes representing HTTP client method calls
 *
 * @example
 * ```typescript
 * const methodCalls = findHttpClientMethodCalls(sourceFile);
 * // Finds calls like: httpClient.get(), httpClientGet.post(), myClient.put(), etc.
 * ```
 */
export const findHttpClientMethodCalls = (
	sourceFile: SourceFile,
): CallExpression[] => {
	// First, find all HttpClient variable declarations to know which variable names to look for
	const httpClientVariables = new Set<string>();

	for (const newExpr of sourceFile.getDescendantsOfKind(
		SyntaxKind.NewExpression,
	)) {
		const expression = newExpr.getExpression();
		if (
			Node.isIdentifier(expression) &&
			expression.getText() === "HttpClient"
		) {
			// Find the parent variable declaration
			const parent = newExpr.getParent();
			if (Node.isVariableDeclaration(parent)) {
				httpClientVariables.add(parent.getName());
			}
		}
	}

	return sourceFile
		.getDescendantsOfKind(SyntaxKind.CallExpression)
		.filter((callExpr) => {
			const expression = callExpr.getExpression();
			if (Node.isPropertyAccessExpression(expression)) {
				const object = expression.getExpression();
				const propertyName = expression.getName();

				return (
					Node.isIdentifier(object) &&
					httpClientVariables.has(object.getText()) &&
					["get", "post", "put", "delete"].includes(propertyName)
				);
			}
			return false;
		});
};

/**
 * Adds type parameters to HTTP client method calls based on the extracted type information.
 *
 * This function processes HTTP client method calls and adds the appropriate type
 * parameters to get() and post() methods. It finds the specific HTTP client
 * variable declaration for each method call and uses the corresponding type.
 *
 * @param methodCalls - Array of CallExpression nodes representing HTTP client method calls
 * @param httpClientToTypeMap - Map of HTTP client variable names to their type information
 *
 * @example
 * ```typescript
 * // Before: httpClient.get('/users')
 * // After:  httpClient.get<UserOutputSchemaType>('/users')
 * addTypeParametersToMethodCalls(methodCalls, httpClientToTypeMap);
 * ```
 */
export const addTypeParametersToMethodCalls = (
	methodCalls: CallExpression[],
	httpClientToTypeMap: Map<string, HttpClientInfo>,
): void => {
	for (const callExpr of methodCalls) {
		const expression = callExpr.getExpression();
		if (!Node.isPropertyAccessExpression(expression)) {
			continue;
		}

		const methodName = expression.getName();
		const object = expression.getExpression();

		if (!Node.isIdentifier(object)) {
			continue;
		}

		const httpClientName = object.getText();

		// Find the function that contains this method call
		const functionName = findContainingFunctionName(callExpr);

		// Look for the HTTP client info using the combined key
		const key = `${httpClientName}:${functionName}`;
		const httpClientInfo = httpClientToTypeMap.get(key);

		if (httpClientInfo) {
			const typeArguments = callExpr.getTypeArguments();
			if (typeArguments.length === 0) {
				const callText = callExpr.getText();
				const newCallText = callText.replace(
					`${httpClientName}.${methodName}(`,
					`${httpClientName}.${methodName}<${httpClientInfo.typeName}>(`,
				);

				callExpr.replaceWithText(newCallText);
			}
		}
	}
};

/**
 * Adds import declarations for schema types used by HTTP clients.
 *
 * This function analyzes the HTTP client type mapping and adds the necessary
 * import statements for the schema types. It checks for existing imports to
 * avoid duplicates and constructs the appropriate import paths dynamically
 * based on the source file's location in the project.
 *
 * @param sourceFile - The TypeScript source file to add imports to
 * @param httpClientToTypeMap - Map of HTTP client variable names to their type information
 *
 * @example
 * ```typescript
 * // From src/core/transformer.ts: import { UserOutputSchemaType } from '../../http-schemas/UserOutput';
 * // From src/portal/api.ts: import { UserOutputSchemaType } from '../../http-schemas/UserOutput';
 * // From e2e/test.ts: import { UserOutputSchemaType } from '../http-schemas/UserOutput';
 * addSchemaTypeImports(sourceFile, httpClientToTypeMap);
 * ```
 */
export const addSchemaTypeImports = (
	sourceFile: SourceFile,
	httpClientToTypeMap: Map<string, HttpClientInfo>,
): void => {
	const existingImports = sourceFile.getImportDeclarations();
	const sourceFilePath = sourceFile.getFilePath();
	const httpSchemasBasePath = calculateHttpSchemasPath(sourceFilePath);

	for (const { typeName } of httpClientToTypeMap.values()) {
		const schemaName = typeName.replace("OutputSchemaType", "");
		const hasImport = existingImports.some((importDecl) => {
			const moduleSpecifier = importDecl.getModuleSpecifierValue();
			const namedImports = importDecl.getNamedImports();
			return (
				moduleSpecifier.includes(`${schemaName}Output`) &&
				namedImports.some((namedImport) => namedImport.getName() === typeName)
			);
		});

		if (!hasImport) {
			const moduleSpecifier = `${httpSchemasBasePath}/${schemaName}Output`;
			sourceFile.addImportDeclaration({
				namedImports: [typeName],
				moduleSpecifier,
				isTypeOnly: true,
			});
		}
	}
};

/**
 * Adds schema type imports for Katalist calls that have been transformed.
 *
 * This function finds all katalist get() calls that now have type parameters
 * and ensures the corresponding schema types are imported.
 *
 * @param sourceFile - The TypeScript source file to process
 */
export const addKatalistSchemaImports = (sourceFile: SourceFile): void => {
	const existingImports = sourceFile.getImportDeclarations();
	const sourceFilePath = sourceFile.getFilePath();
	const httpSchemasBasePath = calculateHttpSchemasPath(sourceFilePath);

	// Find all katalist calls with type parameters
	const katalistCalls = findKatalistCallsWithSchemaGeneration(sourceFile);

	for (const callExpr of katalistCalls) {
		const expression = callExpr.getExpression();
		if (!Node.isPropertyAccessExpression(expression)) {
			continue;
		}

		// Check if type arguments are present (meaning it was transformed)
		const typeArguments = callExpr.getTypeArguments();
		if (typeArguments.length > 0 && typeArguments[0]) {
			const typeName = typeArguments[0].getText();
			// Extract schema name from type (e.g., "PostSchemaType" -> "Post")
			const schemaName = typeName.replace("SchemaType", "");

			// Check if import already exists
			const hasImport = existingImports.some((importDecl) => {
				const moduleSpecifier = importDecl.getModuleSpecifierValue();
				const namedImports = importDecl.getNamedImports();
				return (
					moduleSpecifier.includes(schemaName) &&
					namedImports.some((namedImport) => namedImport.getName() === typeName)
				);
			});

			if (!hasImport) {
				const moduleSpecifier = `${httpSchemasBasePath}/${schemaName}`;
				sourceFile.addImportDeclaration({
					namedImports: [typeName],
					moduleSpecifier,
					isTypeOnly: true,
				});
			}
		}
	}
};

/**
 * Main function that adds type information to HTTP client calls in a source file.
 *
 * This function orchestrates the entire transformation process:
 * 1. Extracts HTTP client variables and their type information
 * 2. Finds HTTP client method calls
 * 3. Adds type parameters to method calls
 * 4. Adds necessary schema type imports
 * 5. Formats the code
 *
 * @param sourceFile - The TypeScript source file to transform
 * @returns The formatted code after adding type information
 *
 * @example
 * ```typescript
 * const formatted = addTypeToHttpClientCall(sourceFile);
 * // Transforms HTTP client calls to include proper type parameters
 * ```
 */
export const addTypeToHttpClientCall = (
	sourceFile: SourceFile,
	functionNames?: string[],
): string => {
	const httpClientToTypeMap = extractHttpClientVariablesWithZodOutput(
		sourceFile,
		functionNames,
	);
	const methodCalls = findHttpClientMethodCalls(sourceFile);

	addTypeParametersToMethodCalls(methodCalls, httpClientToTypeMap);
	addSchemaTypeImports(sourceFile, httpClientToTypeMap);

	return formatWithBiome(sourceFile);
};
