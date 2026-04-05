import path from "path";
import { type AssetDefinition } from "../shared/fieldTypes";
import { normalizePosixPath } from "../shared/pathUtils";

type AssetPathMatcherNode = {
  children: Map<string, AssetPathMatcherNode>;
  assetDefinitionsByExtension: Map<string, AssetDefinition>;
};

export class AssetPathMatcher {
  private readonly root = createAssetPathMatcherNode();

  constructor(assetDefinitions: Iterable<AssetDefinition>) {
    for (const assetDefinition of assetDefinitions) {
      this.addAssetDefinition(assetDefinition);
    }
  }

  getAssetDefinition(assetPath: string): AssetDefinition | undefined {
    const pathSegments = splitAssetPath(assetPath);
    if (!pathSegments) {
      return undefined;
    }

    const fileName = pathSegments[pathSegments.length - 1];
    const extension = path.posix.extname(fileName);
    if (!extension) {
      return undefined;
    }

    let node = this.root;
    let matchedAssetDefinition = node.assetDefinitionsByExtension.get(extension);

    for (const segment of pathSegments.slice(0, -1)) {
      const childNode = node.children.get(segment);
      if (!childNode) {
        return matchedAssetDefinition;
      }
      node = childNode;
      matchedAssetDefinition = node.assetDefinitionsByExtension.get(extension) ?? matchedAssetDefinition;
    }

    return matchedAssetDefinition;
  }

  private addAssetDefinition(assetDefinition: AssetDefinition): void {
    if (!assetDefinition.path || !assetDefinition.extension) {
      return;
    }

    const pathSegments = ["Server", ...getPathSegments(assetDefinition.path)];
    let node = this.root;

    for (const segment of pathSegments) {
      if (node.assetDefinitionsByExtension.size > 0) {
        throw new Error(
          `Overlapping asset schema path detected. ${describeAssetDefinition(assetDefinition)} extends an existing asset schema path.`,
        );
      }

      let childNode = node.children.get(segment);
      if (!childNode) {
        childNode = createAssetPathMatcherNode();
        node.children.set(segment, childNode);
      }
      node = childNode;
    }

    if (node.children.size > 0) {
      throw new Error(
        `Overlapping asset schema path detected. ${describeAssetDefinition(assetDefinition)} is a prefix of an existing asset schema path.`,
      );
    }

    const existingDefinition = node.assetDefinitionsByExtension.get(assetDefinition.extension);
    if (existingDefinition) {
      throw new Error(
        `Duplicate asset schema path detected for ${assetDefinition.path}${assetDefinition.extension}: ${describeAssetDefinition(existingDefinition)} and ${describeAssetDefinition(assetDefinition)}.`,
      );
    }

    node.assetDefinitionsByExtension.set(assetDefinition.extension, assetDefinition);
  }
}

function createAssetPathMatcherNode(): AssetPathMatcherNode {
  return {
    children: new Map<string, AssetPathMatcherNode>(),
    assetDefinitionsByExtension: new Map<string, AssetDefinition>(),
  };
}

function splitAssetPath(assetPath: string): string[] | undefined {
  const pathSegments = getPathSegments(assetPath);
  const serverIndex = pathSegments.indexOf("Server");
  if (serverIndex < 0 || serverIndex === pathSegments.length - 1) {
    return undefined;
  }
  return pathSegments.slice(serverIndex);
}

function getPathSegments(inputPath: string): string[] {
  return normalizePosixPath(inputPath).split("/").filter(Boolean);
}

function describeAssetDefinition(assetDefinition: AssetDefinition): string {
  return `${assetDefinition.title} (${assetDefinition.path}${assetDefinition.extension})`;
}
