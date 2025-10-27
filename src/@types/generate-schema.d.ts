declare module "generate-schema" {
	export interface GenerateSchema {
		json(jsonRecord: Record<string, unknown>): Record<string, unknown>;
	}

	const generateSchema: GenerateSchema;
	export default generateSchema;
}
