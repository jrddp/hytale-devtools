import { readdirSync } from "fs";
import path from "path";
import { type BasicLogger } from "../shared/commonTypes";
import {
  type AssetDefinition,
  type Field,
  type ObjectField,
  type StringField,
  type VariantField,
} from "../shared/fieldTypes";
import { firstGlobMatch, safeParseJSONFile } from "../shared/fileUtils";
import { isObject } from "../shared/typeUtils";
import { schemaPathToGlobPattern } from "../utils/hytalePaths";
import { type CommonSchemaFile, type StandardSchemaFile } from "./schemaDefinitionTypes";
import { schemaDefinitionToAssetDefinition } from "./schemaToFieldResolver";

export class SchemaRuntime {
  /** maps exact $ref strings to their definitions */
  readonly assetsByRef = new Map<string, AssetDefinition>();
  /** maps path matching glob patterns to their definitions */
  readonly assetsByGlobPattern = new Map<string, AssetDefinition>();
  readonly schemaDir: string;
  private readonly logger: BasicLogger;

  constructor(schemaDir: string, logger: BasicLogger = console) {
    this.schemaDir = schemaDir;
    this.logger = logger;
    this.loadAssetDefinitions();
  }

  /** @param referenceWithPointer - e.g. "common.json#/definitions/AssetName/properties/propertyKey" or "BiomeAsset.json#"
   * this reference style omits array indexes (e.g. /Props/0/key is not supported)
   * @param withConstant [key, value] - if the resolution requires a variant resolution, the variant will be matched according to the key and value.
   * withConstant is used only for resolving the base reference as a variant.
   */
  resolveFieldByReferencePointer(
    referenceWithPointer: string,
    withConstant?: [string, string],
  ): Field | undefined {
    const hashLoc = referenceWithPointer.indexOf("#");
    if (hashLoc <= 0) {
      this.logger.error(`Invalid reference: ${referenceWithPointer}`);
      return undefined;
    }
    let baseRef = referenceWithPointer.slice(0, hashLoc + 1);
    let schemaPointer = referenceWithPointer.slice(hashLoc + 1);
    if (schemaPointer.startsWith("/definitions")) {
      // common.json#/definitions/AssetName{/properties/propertyKey}
      // get index of 3rd slash or end of string if no 3rd slash
      const thirdSlashIndex = schemaPointer.indexOf("/", schemaPointer.indexOf("/", 1) + 1);
      if (thirdSlashIndex <= 0) {
        // no 3rd slash -> ends at common.json#/definitions/AssetName
        baseRef = referenceWithPointer;
        schemaPointer = "";
      } else {
        baseRef += schemaPointer.slice(0, thirdSlashIndex);
        schemaPointer = schemaPointer.slice(thirdSlashIndex);
      }
    }
    let result = this.assetsByRef.get(baseRef)?.rootField;
    if (!result) {
      this.logger.error(
        `Base reference ${baseRef} not found when resolving reference: ${referenceWithPointer}`,
      );
      return undefined;
    }
    if (result?.type === "variant") {
      if (withConstant) {
        const [constKey, constValue] = withConstant;
        if (constKey !== result.identityField.schemaKey) {
          this.logger.error(
            `Constant key mismatch for variant field: ${constKey} !== ${result.identityField.schemaKey}`,
          );
        }
        const variant = result.variantsByIdentity[constValue];
        if (variant?.type === "ref") {
          result = this.assetsByRef.get(variant.$ref)?.rootField;
        } else {
          result = variant;
        }
        if (!result) {
          this.logger.error(
            `Variant match not found for constant ${withConstant} on reference: ${referenceWithPointer}`,
          );
        }
      }
    }
    if (!schemaPointer) {
      return result;
    }
    let walker: any = result;
    for (const propertyKey of schemaPointer.split("/").slice(1)) {
      if (!(propertyKey in walker)) {
        this.logger.error(`Property not found for reference: ${referenceWithPointer}`, propertyKey);
        return undefined;
      }
      walker = walker[propertyKey];
      // shrink array into items. tuples not supported.
      if ("items" in walker && isObject(walker.items)) {
        walker = walker.items;
      }
      if ("$ref" in walker) {
        walker = this.assetsByRef.get(walker.$ref)?.rootField;
      }
    }
    return walker as Field;
  }

  getAssetDefinitionForPath(assetPath: string): AssetDefinition | undefined {
    const match = firstGlobMatch(assetPath, Array.from(this.assetsByGlobPattern.keys()));
    return match ? this.assetsByGlobPattern.get(match) : undefined;
  }

  private loadAssetDefinitions(): void {
    const unhydratedVariants: VariantField[] = [];

    for (const file of readdirSync(this.schemaDir)) {
      if (!file.endsWith(".json")) {
        this.logger.warn(`Unexpected file in schema directory: ${file}`);
        continue;
      }
      if (file === "NPCRole.json" || file === "other.json" || file === "InstanceConfig.json") {
        // TODO implement NPC editor and handle instance config special case (UUID is string | object with no extra information)
        continue;
      }

      if (file === "common.json") {
        const fileContent = safeParseJSONFile(path.join(this.schemaDir, file)) as CommonSchemaFile;
        for (const [key, value] of Object.entries(fileContent.definitions)) {
          const ref = `common.json#/definitions/${key}`;
          const assetDefinition = schemaDefinitionToAssetDefinition(
            value,
            unhydratedVariants,
            this.logger,
          );
          if (!assetDefinition) {
            this.logger.error(`Failed to convert schema definition to asset definition: ${ref}`);
            continue;
          }
          this.assetsByRef.set(ref, assetDefinition);
        }
      } else {
        const fileContent = safeParseJSONFile(
          path.join(this.schemaDir, file),
        ) as StandardSchemaFile;
        const assetDefinition = schemaDefinitionToAssetDefinition(
          fileContent,
          unhydratedVariants,
          this.logger,
        );
        if (!assetDefinition) {
          this.logger.error(`Failed to convert schema definition to asset definition: ${file}`);
          continue;
        }
        assetDefinition.path = fileContent.hytale.path;
        assetDefinition.extension = fileContent.hytale.extension;
        this.assetsByRef.set(`${fileContent.$id}#`, assetDefinition);
        const globPattern = schemaPathToGlobPattern(
          fileContent.hytale.path,
          fileContent.hytale.extension,
        );
        this.assetsByGlobPattern.set(globPattern, assetDefinition);
      }
    }

    this.hydrateVariants(unhydratedVariants);
    this.computeNestedRefDependencies(this.assetsByRef);
  }

  private hydrateVariants(unhydratedVariants: VariantField[]): void {
    // hydrate variants (resolve the identity map and clear unmapped fields)
    for (const variantField of unhydratedVariants) {
      for (const field of variantField.unmappedFields ?? []) {
        let resolvedField: ObjectField;
        if (field.type === "ref") {
          const resolvedRef = this.assetsByRef.get(field.$ref);
          if (resolvedRef?.rootField.type !== "object") {
            this.logger.error(`Unexpected field type for variant field: ${field.type}`);
            continue;
          }
          resolvedField = resolvedRef.rootField;
        } else {
          resolvedField = field;
        }
        const objectIdentityField = resolvedField.properties[
          variantField.identityField.schemaKey
        ] as StringField | undefined;
        if (objectIdentityField === undefined) {
          this.logger.error(
            `Identity field not recognized for variant field: ${variantField.identityField.schemaKey} on ${variantField.schemaKey} : ${JSON.stringify(resolvedField)}, ${JSON.stringify(variantField.identityField)}`,
          );
          continue;
        }
        // object identity fields are either constants or have excluded values
        // DONT SET VALUES TO THE RESOLVED FIELD, it causes circular dependencies
        if (objectIdentityField.const !== undefined) {
          variantField.variantsByIdentity[objectIdentityField.const] = field;
        } else {
          for (const value of variantField.identityField.enumVals ?? []) {
            if (objectIdentityField.bannedValues?.includes(value)) {
              continue;
            }
            variantField.variantsByIdentity[value] = field;
          }
        }
      }
    }
  }

  /** Compute nested ref dependencies via DFS */
  private computeNestedRefDependencies(assetsByRef: Map<string, AssetDefinition>): void {
    const computedRefs = new Set<string>();
    const visiting = new Set<string>();

    const collect = (ref: string): Set<string> => {
      if (computedRefs.has(ref)) {
        return assetsByRef.get(ref)?.refDependencies ?? new Set();
      }

      if (visiting.has(ref)) {
        return new Set();
      }

      visiting.add(ref);

      const asset = assetsByRef.get(ref);
      const result = new Set<string>();

      if (asset) {
        for (const directDep of asset.refDependencies) {
          result.add(directDep);

          const nestedDeps = collect(directDep);
          for (const nestedDep of nestedDeps) {
            if (nestedDep !== ref) {
              result.add(nestedDep);
            }
          }
        }

        asset.refDependencies = result;
      }

      visiting.delete(ref);
      computedRefs.add(ref);
      return result;
    };

    for (const ref of assetsByRef.keys()) {
      collect(ref);
    }
  }
}
