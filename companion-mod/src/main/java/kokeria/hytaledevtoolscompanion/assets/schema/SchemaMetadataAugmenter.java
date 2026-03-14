package kokeria.hytaledevtoolscompanion.assets.schema;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

import org.bson.BsonArray;
import org.bson.BsonDocument;
import org.bson.BsonString;
import org.bson.BsonValue;

public final class SchemaMetadataAugmenter {
    private static final Pattern IMPORTED_FAMILY_PROPERTY_PATTERN = Pattern
            .compile("^common\\.json#/definitions/Imported(.+)Asset/properties/Name$");
    private static final Pattern EXPORT_AS_COMMON_PATTERN = Pattern
            .compile("^common\\.json#/definitions/(.+)Asset/properties/ExportAs$");

    private static final List<HiddenRegistryRule> HIDDEN_REGISTRY_RULES = List.of(
            new HiddenRegistryRule("common.json#/definitions/MaterialAsset/properties/Solid", "BlockType"),
            new HiddenRegistryRule("common.json#/definitions/MaterialAsset/properties/Fluid", "Fluid"),
            new HiddenRegistryRule("common.json#/definitions/ConstantEnvironmentProviderAsset/properties/Environment",
                    "Environment"),
            new HiddenRegistryRule("common.json#/definitions/ConnectedBlockPatternRule/properties/BlockTypes",
                    "BlockType"),
            new HiddenRegistryRule("common.json#/definitions/ConnectedBlockPatternRule/properties/BlockTypeLists",
                    "BlockTypeListAsset"),
            new HiddenRegistryRule("common.json#/definitions/DurabilityLossBlockTypes/properties/BlockTypes",
                    "BlockType"),
            new HiddenRegistryRule("common.json#/definitions/DurabilityLossBlockTypes/properties/BlockSets",
                    "BlockSet"),
            new HiddenRegistryRule("common.json#/definitions/DefaultFluidTicker/properties/SupportedBy", "Fluid"),
            new HiddenRegistryRule("common.json#/definitions/FireFluidTicker/properties/SupportedBy", "Fluid"),
            new HiddenRegistryRule("common.json#/definitions/FiniteFluidTicker/properties/SupportedBy", "Fluid"),
            new HiddenRegistryRule("common.json#/definitions/FluidCollisionConfig/properties/BlockToPlace",
                    "BlockType"),
            new HiddenRegistryRule("common.json#/definitions/FlammabilityConfig/properties/ResultingBlock",
                    "BlockType"));

    private static final Set<String> DECIMAL_CONSTANT_CONSUMER_KEYS = Set.of(
            "common.json#/definitions/BaseHeightDensityAsset/properties/BaseHeightName",
            "common.json#/definitions/SimpleHorizontalMaterialProviderAsset/properties/TopBaseHeight",
            "common.json#/definitions/SimpleHorizontalMaterialProviderAsset/properties/BottomBaseHeight",
            "common.json#/definitions/BaseHeightPositionProviderAsset/properties/BedName",
            "common.json#/definitions/ColumnLinearScannerAsset/properties/BaseHeightName",
            "common.json#/definitions/ColumnRandomScannerAsset/properties/BaseHeightName");

    private SchemaMetadataAugmenter() {
    }

    public static void augment(@Nonnull Map<String, BsonDocument> schemaDocuments) {
        Map<String, SchemaNodeRef> schemaNodes = collectSchemaNodes(schemaDocuments);
        Set<String> decimalConstantDefinitionKeys = findDecimalConstantDefinitionKeys(schemaDocuments);

        for (SchemaNodeRef nodeRef : schemaNodes.values()) {
            nodeRef.node().remove("hytaleDevtools");

            BsonDocument metadata = new BsonDocument();
            BsonDocument symbolRef = buildSymbolRef(nodeRef);
            BsonDocument definesSymbol = buildDefinesSymbol(nodeRef, decimalConstantDefinitionKeys);
            if (symbolRef != null) {
                metadata.put("symbolRef", symbolRef);
            }
            if (definesSymbol != null) {
                metadata.put("definesSymbol", definesSymbol);
            }
            if (!metadata.isEmpty()) {
                nodeRef.node().put("hytaleDevtools", metadata);
            }
        }
    }

    @Nullable
    private static BsonDocument buildSymbolRef(@Nonnull SchemaNodeRef nodeRef) {
        String propertyKey = nodeRef.key();
        String importFamily = importFamilyReference(propertyKey);
        if (importFamily != null) {
            return indexRef("exportFamily", importFamily);
        }

        if (DECIMAL_CONSTANT_CONSUMER_KEYS.contains(propertyKey)) {
            return indexRef("referenceBundle", "DecimalConstants");
        }

        String hiddenRegistryDomain = hiddenRegistryDomain(propertyKey);
        if (hiddenRegistryDomain != null) {
            return indexRef("registeredAssets", hiddenRegistryDomain);
        }

        String hytaleAssetRef = stringValue(nodeRef.node(), "hytaleAssetRef");
        if (hytaleAssetRef != null && !hytaleAssetRef.isBlank()) {
            return indexRef("registeredAssets", hytaleAssetRef);
        }

        BsonDocument hytaleParent = getDocument(nodeRef.node(), "hytaleParent");
        String parentType = hytaleParent == null ? null : stringValue(hytaleParent, "type");
        if (parentType != null && !parentType.isBlank()) {
            return indexRef("registeredAssets", parentType);
        }

        BsonDocument hytaleCommonAsset = getDocument(nodeRef.node(), "hytaleCommonAsset");
        if (hytaleCommonAsset != null) {
            List<String> folders = bsonStringArray(hytaleCommonAsset.get("requiredRoots"));
            if (!folders.isEmpty()) {
                BsonDocument symbolRef = indexRef("commonAssetPaths", "all");
                symbolRef.put("folders", toStringArray(folders));
                String extension = stringValue(hytaleCommonAsset, "requiredExtension");
                if (extension != null && !extension.isBlank()) {
                    symbolRef.put("extension", new BsonString(extension));
                }
                return symbolRef;
            }
        }

        String uiDataSetKey = findUiDataSetKey(nodeRef.node());
        if (uiDataSetKey != null) {
            return indexRef("uiDataSet", uiDataSetKey);
        }

        return null;
    }

    @Nullable
    private static BsonDocument buildDefinesSymbol(
            @Nonnull SchemaNodeRef nodeRef,
            @Nonnull Set<String> decimalConstantDefinitionKeys) {
        String propertyKey = nodeRef.key();
        String exportFamily = exportFamilyDefinition(propertyKey);
        if (exportFamily != null) {
            return indexRef("exportFamily", exportFamily);
        }

        if (decimalConstantDefinitionKeys.contains(propertyKey)) {
            return indexRef("referenceBundle", "DecimalConstants");
        }

        return null;
    }

    @Nullable
    private static String importFamilyReference(@Nonnull String propertyKey) {
        if ("BlockMaskAsset.json#/properties/Import".equals(propertyKey)) {
            return "BlockMask";
        }

        Matcher matcher = IMPORTED_FAMILY_PROPERTY_PATTERN.matcher(propertyKey);
        return matcher.matches() ? matcher.group(1) : null;
    }

    @Nullable
    private static String exportFamilyDefinition(@Nonnull String propertyKey) {
        if ("BlockMaskAsset.json#/properties/ExportAs".equals(propertyKey)) {
            return "BlockMask";
        }

        Matcher matcher = EXPORT_AS_COMMON_PATTERN.matcher(propertyKey);
        return matcher.matches() ? matcher.group(1) : null;
    }

    @Nullable
    private static String hiddenRegistryDomain(@Nonnull String propertyKey) {
        for (HiddenRegistryRule rule : HIDDEN_REGISTRY_RULES) {
            if (rule.propertyKey().equals(propertyKey)) {
                return rule.domain();
            }
        }
        return null;
    }

    @Nullable
    private static String findUiDataSetKey(@Nonnull BsonDocument node) {
        BsonDocument hytale = getDocument(node, "hytale");
        BsonDocument uiEditorComponent = hytale == null ? null : getDocument(hytale, "uiEditorComponent");
        if (uiEditorComponent == null) {
            return null;
        }

        String component = stringValue(uiEditorComponent, "component");
        if (!"Text".equals(component) && !"Dropdown".equals(component)) {
            return null;
        }

        String key = stringValue(uiEditorComponent, "key");
        if (key == null || key.isBlank()) {
            key = stringValue(uiEditorComponent, "dataSet");
        }
        return key == null || key.isBlank() ? null : key;
    }

    @Nonnull
    private static Set<String> findDecimalConstantDefinitionKeys(@Nonnull Map<String, BsonDocument> schemaDocuments) {
        Set<String> keys = new LinkedHashSet<>();
        BsonDocument common = schemaDocuments.get("common.json");
        if (common == null) {
            return keys;
        }

        BsonDocument items = getPathDocument(common,
                "definitions",
                "DecimalConstantsFrameworkAsset",
                "properties",
                "Entries",
                "items");
        if (items == null) {
            return keys;
        }

        String ref = stringValue(items, "$ref");
        if (ref == null || ref.isBlank()) {
            return keys;
        }

        String[] split = ref.split("#", 2);
        String schemaFile = split.length > 0 && !split[0].isBlank() ? split[0] : "common.json";
        String pointer = split.length > 1 ? split[1] : "";
        if (!pointer.startsWith("/")) {
            return keys;
        }

        keys.add(schemaFile + "#" + pointer + "/properties/Name");
        return keys;
    }

    @Nonnull
    private static Map<String, SchemaNodeRef> collectSchemaNodes(@Nonnull Map<String, BsonDocument> schemaDocuments) {
        Map<String, SchemaNodeRef> schemaNodes = new TreeMap<>();
        for (Map.Entry<String, BsonDocument> entry : schemaDocuments.entrySet()) {
            collectSchemaNodesRecursive(entry.getKey(), "", entry.getValue(), schemaNodes);
        }
        return schemaNodes;
    }

    private static void collectSchemaNodesRecursive(
            @Nonnull String schemaFile,
            @Nonnull String pointer,
            @Nonnull BsonValue value,
            @Nonnull Map<String, SchemaNodeRef> schemaNodes) {
        if (value.isDocument()) {
            BsonDocument document = value.asDocument();
            schemaNodes.put(schemaFile + "#" + pointer, new SchemaNodeRef(schemaFile, pointer, document));

            List<String> keys = new ArrayList<>(document.keySet());
            keys.sort(String::compareTo);
            for (String key : keys) {
                BsonValue child = document.get(key);
                if (child != null) {
                    collectSchemaNodesRecursive(schemaFile, appendJsonPointer(pointer, key), child, schemaNodes);
                }
            }
            return;
        }

        if (value.isArray()) {
            BsonArray array = value.asArray();
            for (int i = 0; i < array.size(); i++) {
                collectSchemaNodesRecursive(schemaFile, appendJsonPointer(pointer, String.valueOf(i)), array.get(i),
                        schemaNodes);
            }
        }
    }

    @Nonnull
    private static BsonDocument indexRef(@Nonnull String indexKind, @Nonnull String key) {
        BsonDocument document = new BsonDocument();
        document.put("indexKind", new BsonString(indexKind));
        document.put("key", new BsonString(key));
        return document;
    }

    @Nullable
    private static BsonDocument getDocument(@Nonnull BsonDocument document, @Nonnull String key) {
        BsonValue value = document.get(key);
        return value != null && value.isDocument() ? value.asDocument() : null;
    }

    @Nullable
    private static BsonDocument getPathDocument(@Nonnull BsonDocument root, @Nonnull String... keys) {
        BsonDocument current = root;
        for (String key : keys) {
            current = getDocument(current, key);
            if (current == null) {
                return null;
            }
        }
        return current;
    }

    @Nullable
    private static String stringValue(@Nonnull BsonDocument document, @Nonnull String key) {
        BsonValue value = document.get(key);
        return value != null && value.isString() ? value.asString().getValue() : null;
    }

    @Nonnull
    private static List<String> bsonStringArray(@Nullable BsonValue value) {
        if (value == null || !value.isArray()) {
            return List.of();
        }

        List<String> result = new ArrayList<>();
        for (BsonValue element : value.asArray()) {
            if (element.isString()) {
                result.add(element.asString().getValue());
            }
        }
        return result;
    }

    @Nonnull
    private static BsonArray toStringArray(@Nonnull List<String> values) {
        BsonArray array = new BsonArray();
        for (String value : values) {
            array.add(new BsonString(value));
        }
        return array;
    }

    @Nonnull
    private static String appendJsonPointer(@Nonnull String pointer, @Nonnull String token) {
        return pointer.isEmpty() ? "/" + escapeJsonPointer(token) : pointer + "/" + escapeJsonPointer(token);
    }

    @Nonnull
    private static String escapeJsonPointer(@Nonnull String token) {
        return token.replace("~", "~0").replace("/", "~1");
    }

    record HiddenRegistryRule(@Nonnull String propertyKey, @Nonnull String domain) {
    }

    record SchemaNodeRef(@Nonnull String schemaFile, @Nonnull String pointer, @Nonnull BsonDocument node) {
        @Nonnull
        String key() {
            return this.schemaFile + "#" + this.pointer;
        }
    }
}
