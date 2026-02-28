package kokeria.hytaledevtoolscompanion.assets;

import java.io.IOException;
import java.lang.reflect.Array;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitOption;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.logging.Level;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

import org.bson.BsonArray;
import org.bson.BsonBoolean;
import org.bson.BsonDocument;
import org.bson.BsonNull;
import org.bson.BsonString;
import org.bson.BsonValue;

import com.hypixel.hytale.assetstore.AssetMap;
import com.hypixel.hytale.assetstore.AssetRegistry;
import com.hypixel.hytale.assetstore.AssetStore;
import com.hypixel.hytale.builtin.asseteditor.AssetEditorPlugin;
import com.hypixel.hytale.builtin.asseteditor.assettypehandler.AssetStoreTypeHandler;
import com.hypixel.hytale.builtin.asseteditor.assettypehandler.AssetTypeHandler;
import com.hypixel.hytale.codec.Codec;
import com.hypixel.hytale.codec.EmptyExtraInfo;
import com.hypixel.hytale.codec.KeyedCodec;
import com.hypixel.hytale.codec.builder.BuilderCodec;
import com.hypixel.hytale.codec.builder.BuilderField;
import com.hypixel.hytale.codec.codecs.EnumCodec;
import com.hypixel.hytale.codec.lookup.ACodecMapCodec;
import com.hypixel.hytale.codec.schema.SchemaContext;
import com.hypixel.hytale.codec.schema.config.Schema;
import com.hypixel.hytale.common.util.java.ManifestUtil;
import com.hypixel.hytale.protocol.packets.asseteditor.AssetEditorAssetType;
import com.hypixel.hytale.server.core.asset.AssetRegistryLoader;
import com.hypixel.hytale.server.core.plugin.JavaPlugin;
import com.hypixel.hytale.server.core.util.BsonUtil;

public final class AssetRegistryExportService {
    private static final String SCHEMA_MAPPINGS_FILE = "schema_mappings";
    private static final String SCHEMAS_DIRECTORY = "schemas";
    private static final String INDEXES_DIRECTORY = "indexes";

    private static final String HYTALE_GENERATOR_ASSETS_PACKAGE_PREFIX = "com.hypixel.hytale.builtin.hytalegenerator.assets.";

    private static final Pattern IMPORTED_FAMILY_PROPERTY_PATTERN = Pattern
            .compile("^common\\.json#/definitions/Imported(.+)Asset/properties/Name$");
    private static final Pattern EXPORT_AS_COMMON_PATTERN = Pattern
            .compile("^common\\.json#/definitions/(.+)Asset/properties/ExportAs$");

    private static final List<ExportFamilyRule> EXPORT_FAMILY_RULES = List.of(
            new ExportFamilyRule("BlockMask",
                    "com.hypixel.hytale.builtin.hytalegenerator.assets.blockmask.BlockMaskAsset"),
            new ExportFamilyRule("Density", "com.hypixel.hytale.builtin.hytalegenerator.assets.density.DensityAsset"),
            new ExportFamilyRule("MaterialProvider",
                    "com.hypixel.hytale.builtin.hytalegenerator.assets.materialproviders.MaterialProviderAsset"),
            new ExportFamilyRule("PositionProvider",
                    "com.hypixel.hytale.builtin.hytalegenerator.assets.positionproviders.PositionProviderAsset"),
            new ExportFamilyRule("Assignments",
                    "com.hypixel.hytale.builtin.hytalegenerator.assets.propassignments.AssignmentsAsset"),
            new ExportFamilyRule("Prop", "com.hypixel.hytale.builtin.hytalegenerator.assets.props.PropAsset"),
            new ExportFamilyRule("Directionality",
                    "com.hypixel.hytale.builtin.hytalegenerator.assets.props.prefabprop.directionality.DirectionalityAsset"),
            new ExportFamilyRule("Pattern", "com.hypixel.hytale.builtin.hytalegenerator.assets.patterns.PatternAsset"),
            new ExportFamilyRule("Scanner", "com.hypixel.hytale.builtin.hytalegenerator.assets.scanners.ScannerAsset"),
            new ExportFamilyRule("Curve", "com.hypixel.hytale.builtin.hytalegenerator.assets.curves.CurveAsset"),
            new ExportFamilyRule("ReturnType",
                    "com.hypixel.hytale.builtin.hytalegenerator.assets.density.positions.returntypes.ReturnTypeAsset"),
            new ExportFamilyRule("VectorProvider",
                    "com.hypixel.hytale.builtin.hytalegenerator.assets.vectorproviders.VectorProviderAsset"),
            new ExportFamilyRule("EnvironmentProvider",
                    "com.hypixel.hytale.builtin.hytalegenerator.assets.environmentproviders.EnvironmentProviderAsset"),
            new ExportFamilyRule("TintProvider",
                    "com.hypixel.hytale.builtin.hytalegenerator.assets.tintproviders.TintProviderAsset"),
            new ExportFamilyRule("PointGenerator",
                    "com.hypixel.hytale.builtin.hytalegenerator.assets.pointgenerators.PointGeneratorAsset"));

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

    private static final List<BundleConsumerRule> DECIMAL_CONSTANT_CONSUMER_RULES = List.of(
            new BundleConsumerRule("common.json#/definitions/BaseHeightDensityAsset/properties/BaseHeightName"),
            new BundleConsumerRule(
                    "common.json#/definitions/SimpleHorizontalMaterialProviderAsset/properties/TopBaseHeight"),
            new BundleConsumerRule(
                    "common.json#/definitions/SimpleHorizontalMaterialProviderAsset/properties/BottomBaseHeight"),
            new BundleConsumerRule("common.json#/definitions/BaseHeightPositionProviderAsset/properties/BedName"),
            new BundleConsumerRule("common.json#/definitions/ColumnLinearScannerAsset/properties/BaseHeightName"),
            new BundleConsumerRule("common.json#/definitions/ColumnRandomScannerAsset/properties/BaseHeightName"));

    private static final List<String> LEGACY_EXPORT_FILES = List.of(
            "stores_info",
            "codecs_info",
            "asset_key_domains",
            "material_solid_values",
            "material_fluid_values",
            "schemas",
            "asset_types_info",
            "property_semantics");

    private AssetRegistryExportService() {
    }

    public static void exportSnapshot(@Nonnull JavaPlugin plugin) {
        exportSnapshot(plugin, null);
    }

    public static void exportSnapshot(@Nonnull JavaPlugin plugin, @Nullable Path outputDirectoryOverride) {
        Path outputDirectory = resolveOutputDirectory(plugin, outputDirectoryOverride);
        String hytaleVersion = resolveHytaleServerVersion();
        if (shouldSkipExport(plugin, outputDirectory, hytaleVersion)) {
            return;
        }

        try {
            ExportContext context = generateSchemasStage();
            Map<String, BsonDocument> propertyNodes = indexPropertyNodes(context.schemaDocuments);

            Map<String, EnumSemanticInfo> enumInfos = collectEnumInfos(context.stores);
            Map<String, SemanticRecord> semanticsByPropertyKey = extractSemanticsStage(
                    context.schemaDocuments,
                    propertyNodes,
                    enumInfos);

            augmentSchemasStage(context.schemaDocuments, semanticsByPropertyKey);

            List<IndexShard> indexShards = extractReferenceIndexesStage(context.stores, context.schemaDocuments,
                    propertyNodes);

            writeArtifactsStage(outputDirectory, context, indexShards, hytaleVersion);
            cleanupRemovedArtifactsStage(outputDirectory);

            plugin.getLogger().at(Level.INFO).log(
                    "Exported snapshot artifacts to %s",
                    outputDirectory);
        } catch (Throwable throwable) {
            plugin.getLogger().at(Level.SEVERE).withCause(throwable).log("Failed to export asset registry snapshot");
        }
    }

    @Nonnull
    private static Path resolveOutputDirectory(@Nonnull JavaPlugin plugin, @Nullable Path outputDirectoryOverride) {
        if (outputDirectoryOverride != null) {
            return outputDirectoryOverride.toAbsolutePath().normalize();
        }
        return plugin.getDataDirectory().toAbsolutePath().normalize();
    }

    private static boolean shouldSkipExport(
            @Nonnull JavaPlugin plugin,
            @Nonnull Path outputDirectory,
            @Nonnull String currentHytaleVersion) {
        String existingHytaleVersion = readExistingSnapshotHytaleVersion(outputDirectory);
        if (existingHytaleVersion == null || !existingHytaleVersion.equals(currentHytaleVersion)) {
            return false;
        }

        plugin.getLogger().at(Level.INFO).log(
                "Same-version snapshot assets already found at %s (hytaleVersion=%s); skipping export.",
                outputDirectory,
                currentHytaleVersion);
        return true;
    }

    @Nullable
    private static String readExistingSnapshotHytaleVersion(@Nonnull Path outputDirectory) {
        Path schemaMappingsPath = outputDirectory.resolve(SCHEMA_MAPPINGS_FILE + ".json");
        if (!Files.isRegularFile(schemaMappingsPath)) {
            return null;
        }

        try {
            String rawJson = Files.readString(schemaMappingsPath, StandardCharsets.UTF_8);
            if (rawJson.isBlank()) {
                return null;
            }

            BsonDocument schemaMappingsDocument = BsonDocument.parse(rawJson);
            BsonValue hytaleVersion = schemaMappingsDocument.get("hytaleVersion");
            if (hytaleVersion != null && hytaleVersion.isString()) {
                String value = hytaleVersion.asString().getValue();
                if (!value.isBlank()) {
                    return value;
                }
            }
        } catch (IOException | RuntimeException ignored) {
            // If existing metadata is unreadable, proceed with a full export.
        }

        return null;
    }

    @Nonnull
    private static ExportContext generateSchemasStage() {
        BsonDocument vscodeConfig = new BsonDocument();
        SchemaContext schemaContext = new SchemaContext();
        Map<String, Schema> schemas = AssetRegistryLoader.generateSchemas(schemaContext, vscodeConfig);

        AssetStore<?, ?, ?>[] stores = AssetRegistry.getStoreMap().values().toArray(AssetStore[]::new);
        Arrays.sort(stores, Comparator.comparing(store -> store.getAssetClass().getSimpleName()));

        Map<String, BsonDocument> schemaDocuments = new TreeMap<>();
        for (Entry<String, Schema> entry : schemas.entrySet()) {
            schemaDocuments.put(entry.getKey(),
                    Schema.CODEC.encode(entry.getValue(), EmptyExtraInfo.EMPTY).asDocument());
        }

        return new ExportContext(vscodeConfig, schemaDocuments, stores);
    }

    @Nonnull
    private static Map<String, BsonDocument> indexPropertyNodes(@Nonnull Map<String, BsonDocument> schemaDocuments) {
        Map<String, BsonDocument> propertyNodes = new TreeMap<>();
        for (Entry<String, BsonDocument> entry : schemaDocuments.entrySet()) {
            indexPropertyNodesRecursive(entry.getKey(), "", entry.getValue(), propertyNodes);
        }
        return propertyNodes;
    }

    private static void indexPropertyNodesRecursive(
            @Nonnull String schemaFile,
            @Nonnull String pointer,
            @Nonnull BsonValue value,
            @Nonnull Map<String, BsonDocument> propertyNodes) {
        if (value.isDocument()) {
            BsonDocument document = value.asDocument();

            BsonValue propertiesValue = document.get("properties");
            if (propertiesValue != null && propertiesValue.isDocument()) {
                BsonDocument properties = propertiesValue.asDocument();
                List<String> names = new ArrayList<>(properties.keySet());
                Collections.sort(names);
                for (String name : names) {
                    BsonValue propertyValue = properties.get(name);
                    if (propertyValue != null && propertyValue.isDocument()) {
                        String propertyPointer = appendJsonPointer(pointer, "properties") + "/"
                                + escapeJsonPointer(name);
                        String propertyKey = schemaFile + "#" + propertyPointer;
                        propertyNodes.put(propertyKey, propertyValue.asDocument());
                    }
                }
            }

            List<String> keys = new ArrayList<>(document.keySet());
            Collections.sort(keys);
            for (String key : keys) {
                BsonValue child = document.get(key);
                if (child != null) {
                    indexPropertyNodesRecursive(schemaFile, appendJsonPointer(pointer, key), child, propertyNodes);
                }
            }
            return;
        }

        if (value.isArray()) {
            BsonArray array = value.asArray();
            for (int i = 0; i < array.size(); i++) {
                indexPropertyNodesRecursive(schemaFile, appendJsonPointer(pointer, String.valueOf(i)), array.get(i),
                        propertyNodes);
            }
        }
    }

    @Nonnull
    private static Map<String, EnumSemanticInfo> collectEnumInfos(@Nonnull AssetStore<?, ?, ?>[] stores) {
        CodecGraphCollector collector = new CodecGraphCollector();
        for (AssetStore<?, ?, ?> store : stores) {
            collector.collect(store.getCodec());
        }

        Map<String, EnumSemanticInfo> enumInfosBySignature = new HashMap<>();
        for (BsonValue enumTypeValue : collector.getEnumTypes()) {
            if (!enumTypeValue.isDocument()) {
                continue;
            }
            BsonDocument enumType = enumTypeValue.asDocument();
            List<String> schemaValues = bsonStringArray(enumType.get("schemaValues"));
            if (schemaValues.isEmpty()) {
                continue;
            }

            EnumSemanticInfo info = new EnumSemanticInfo();
            info.enumClass = stringValue(enumType, "enumClass");
            info.enumStyle = stringValue(enumType, "enumStyle");
            info.canonicalValues = schemaValues;
            info.acceptedValues = bsonStringArray(enumType.get("acceptedLiteralValues"));
            if (info.acceptedValues.isEmpty()) {
                info.acceptedValues = schemaValues;
            }
            info.decodeCaseInsensitive = booleanValue(enumType, "decodeSupportsCaseInsensitiveEnumNames");

            String signature = enumSignature(schemaValues);
            enumInfosBySignature.putIfAbsent(signature, info);
        }

        return enumInfosBySignature;
    }

    @Nonnull
    private static Map<String, SemanticRecord> extractSemanticsStage(
            @Nonnull Map<String, BsonDocument> schemaDocuments,
            @Nonnull Map<String, BsonDocument> propertyNodes,
            @Nonnull Map<String, EnumSemanticInfo> enumInfos) {
        Map<String, SemanticRecord> semantics = new TreeMap<>();

        addSymbolDefinitionSemantics(propertyNodes, semantics);
        addImportSemantics(propertyNodes, semantics);
        addReferenceBundleSemantics(schemaDocuments, propertyNodes, semantics);
        addHiddenRegistrySemantics(propertyNodes, semantics);
        addDiscriminatorSemantics(schemaDocuments, propertyNodes, semantics);

        for (Entry<String, BsonDocument> entry : propertyNodes.entrySet()) {
            String propertyKey = entry.getKey();
            BsonDocument property = entry.getValue();

            if (semantics.containsKey(propertyKey)) {
                continue;
            }

            String containedAssetType = findContainedAssetType(property);
            if (containedAssetType != null) {
                SemanticRecord semantic = new SemanticRecord(propertyKey, "inlineOrReference");
                semantic.valueShape = "stringOrObject";
                semantic.extra.put("referenceSource", sourceRegistryDomain(containedAssetType));
                semantic.extra.put("acceptsInlineValue", BsonBoolean.TRUE);
                semantic.extra.put("acceptsAssetKey", BsonBoolean.TRUE);
                semantics.put(propertyKey, semantic);
                continue;
            }

            List<String> enumMapAllowedKeys = findEnumMapAllowedKeys(property);
            if (!enumMapAllowedKeys.isEmpty()) {
                SemanticRecord semantic = new SemanticRecord(propertyKey, "symbolReference");
                semantic.valueShape = "objectKey";
                semantic.extra.put("target", new BsonString("objectKey"));
                BsonDocument source = new BsonDocument();
                source.put("kind", new BsonString("literalSet"));
                source.put("allowedValues", toStringBsonArray(enumMapAllowedKeys));
                semantic.extra.put("source", source);
                semantic.extra.put("excludeExistingObjectKeys", BsonBoolean.TRUE);
                semantics.put(propertyKey, semantic);
                continue;
            }

            String mapKeyDomain = findMapKeyDomain(property);
            if (mapKeyDomain != null) {
                SemanticRecord semantic = new SemanticRecord(propertyKey, "symbolReference");
                semantic.valueShape = "objectKey";
                semantic.extra.put("target", new BsonString("objectKey"));
                semantic.extra.put("source", sourceRegistryDomain(mapKeyDomain));
                semantic.extra.put("excludeExistingObjectKeys", BsonBoolean.TRUE);
                semantics.put(propertyKey, semantic);
                continue;
            }

            String registryDomain = findRegistryDomain(property);
            if (registryDomain != null) {
                SemanticRecord semantic = new SemanticRecord(propertyKey, "symbolReference");
                semantic.valueShape = inferValueShape(property, "string");
                semantic.extra.put("target", new BsonString("value"));
                semantic.extra.put("source", sourceRegistryDomain(registryDomain));
                semantics.put(propertyKey, semantic);
                continue;
            }

            List<String> enumValues = findEnumValues(property);
            if (!enumValues.isEmpty()) {
                SemanticRecord semantic = new SemanticRecord(propertyKey, "literalChoice");
                semantic.valueShape = inferValueShape(property, "string");

                EnumSemanticInfo enumInfo = enumInfos.get(enumSignature(enumValues));
                List<String> canonicalValues = enumInfo != null ? enumInfo.canonicalValues : enumValues;
                List<String> acceptedValues = enumInfo != null ? enumInfo.acceptedValues : enumValues;

                semantic.extra.put("values", toStringBsonArray(canonicalValues));
                semantic.extra.put("acceptedValues", toStringBsonArray(acceptedValues));
                semantic.extra.put("role", new BsonString("enum"));
                if (enumInfo != null) {
                    semantic.extra.put("normalizeToCanonical",
                            BsonBoolean.valueOf(!acceptedValues.equals(canonicalValues)));
                }
                semantics.put(propertyKey, semantic);
                continue;
            }

            BsonDocument commonAssetMetadata = getDocument(property, "hytaleCommonAsset");
            if (commonAssetMetadata != null) {
                SemanticRecord semantic = new SemanticRecord(propertyKey, "assetPath");
                semantic.valueShape = inferValueShape(property, "string");
                List<String> roots = bsonStringArray(commonAssetMetadata.get("requiredRoots"));
                semantic.extra.put("requiredRoots", toStringBsonArray(roots));
                String requiredExtension = stringValue(commonAssetMetadata, "requiredExtension");
                if (requiredExtension != null) {
                    semantic.extra.put("requiredExtension", new BsonString(requiredExtension));
                }
                BsonValue isUIAsset = commonAssetMetadata.get("isUIAsset");
                if (isUIAsset != null && isUIAsset.isBoolean()) {
                    semantic.extra.put("isUIAsset", BsonBoolean.valueOf(isUIAsset.asBoolean().getValue()));
                }
                semantics.put(propertyKey, semantic);
                continue;
            }

            if (isLocalizationProperty(property)) {
                SemanticRecord semantic = new SemanticRecord(propertyKey, "symbolReference");
                semantic.valueShape = inferValueShape(property, "string");
                semantic.extra.put("target", new BsonString("value"));
                BsonDocument source = new BsonDocument();
                source.put("kind", new BsonString("localization"));
                source.put("localeStrategy", new BsonString("activeThenEnUs"));
                semantic.extra.put("source", source);
                semantics.put(propertyKey, semantic);
                continue;
            }

            String cosmeticDomain = stringValue(property, "hytaleCosmeticAsset");
            if (cosmeticDomain != null && !cosmeticDomain.isBlank()) {
                SemanticRecord semantic = new SemanticRecord(propertyKey, "symbolReference");
                semantic.valueShape = inferValueShape(property, "string");
                semantic.extra.put("target", new BsonString("value"));
                BsonDocument source = new BsonDocument();
                source.put("kind", new BsonString("cosmeticDomain"));
                source.put("domain", new BsonString(cosmeticDomain));
                semantic.extra.put("source", source);
                semantics.put(propertyKey, semantic);
                continue;
            }

            BsonDocument parentSettings = getDocument(property, "hytaleParent");
            if (parentSettings != null) {
                String parentDomain = stringValue(parentSettings, "type");
                if (parentDomain != null && !parentDomain.isBlank()) {
                    SemanticRecord semantic = new SemanticRecord(propertyKey, "symbolReference");
                    semantic.valueShape = inferValueShape(property, "string");
                    semantic.extra.put("target", new BsonString("value"));
                    BsonDocument source = new BsonDocument();
                    source.put("kind", new BsonString("parentDomain"));
                    source.put("domain", new BsonString(parentDomain));
                    String mapKey = stringValue(parentSettings, "mapKey");
                    if (mapKey != null && !mapKey.isBlank()) {
                        source.put("mapKey", new BsonString(mapKey));
                    }
                    String mapKeyValue = stringValue(parentSettings, "mapKeyValue");
                    if (mapKeyValue != null && !mapKeyValue.isBlank()) {
                        source.put("mapKeyValue", new BsonString(mapKeyValue));
                    }
                    source.put("excludeSelf", BsonBoolean.TRUE);
                    semantic.extra.put("source", source);
                    semantics.put(propertyKey, semantic);
                    continue;
                }
            }

            UiDataSetInfo uiDataSetInfo = findUiDataSetInfo(property);
            if (uiDataSetInfo != null) {
                SemanticRecord semantic = new SemanticRecord(propertyKey, "symbolReference");
                semantic.valueShape = inferValueShape(property, "string");
                semantic.extra.put("target", new BsonString("value"));
                BsonDocument source = new BsonDocument();
                source.put("kind", new BsonString("uiDataSet"));
                source.put("dataSet", new BsonString(uiDataSetInfo.dataSet));
                source.put("component", new BsonString(uiDataSetInfo.component));
                semantic.extra.put("source", source);
                semantics.put(propertyKey, semantic);
                continue;
            }

            String colorMode = resolveColorMode(property);
            if (colorMode != null) {
                SemanticRecord semantic = new SemanticRecord(propertyKey, "color");
                semantic.valueShape = inferValueShape(property, "string");
                semantic.extra.put("colorMode", new BsonString(colorMode));
                semantic.extra.put("supportsAlpha", BsonBoolean.valueOf("colorAlpha".equals(colorMode)));
                semantics.put(propertyKey, semantic);
            }
        }

        return semantics;
    }

    private static void addSymbolDefinitionSemantics(
            @Nonnull Map<String, BsonDocument> propertyNodes,
            @Nonnull Map<String, SemanticRecord> semantics) {
        for (String propertyKey : propertyNodes.keySet()) {
            String family = null;
            if ("BlockMaskAsset.json#/properties/ExportAs".equals(propertyKey)) {
                family = "BlockMask";
            } else {
                Matcher matcher = EXPORT_AS_COMMON_PATTERN.matcher(propertyKey);
                if (matcher.matches()) {
                    family = matcher.group(1);
                }
            }
            if (family == null || family.isBlank()) {
                continue;
            }

            SemanticRecord semantic = new SemanticRecord(propertyKey, "symbolDefinition");
            semantic.valueShape = "string";
            BsonDocument namespace = new BsonDocument();
            namespace.put("kind", new BsonString("importFamily"));
            namespace.put("family", new BsonString(family));
            semantic.extra.put("namespace", namespace);
            semantics.put(propertyKey, semantic);
        }
    }

    private static void addImportSemantics(
            @Nonnull Map<String, BsonDocument> propertyNodes,
            @Nonnull Map<String, SemanticRecord> semantics) {
        for (String propertyKey : propertyNodes.keySet()) {
            if ("BlockMaskAsset.json#/properties/Import".equals(propertyKey)) {
                SemanticRecord semantic = new SemanticRecord(propertyKey, "symbolReference");
                semantic.valueShape = "string";
                semantic.extra.put("target", new BsonString("value"));
                BsonDocument source = new BsonDocument();
                source.put("kind", new BsonString("importFamily"));
                source.put("family", new BsonString("BlockMask"));
                source.put("importForm", new BsonString("directImportField"));
                semantic.extra.put("source", source);
                semantics.put(propertyKey, semantic);
                continue;
            }

            Matcher matcher = IMPORTED_FAMILY_PROPERTY_PATTERN.matcher(propertyKey);
            if (!matcher.matches()) {
                continue;
            }

            String family = matcher.group(1);
            SemanticRecord semantic = new SemanticRecord(propertyKey, "symbolReference");
            semantic.valueShape = "string";
            semantic.extra.put("target", new BsonString("value"));
            BsonDocument source = new BsonDocument();
            source.put("kind", new BsonString("importFamily"));
            source.put("family", new BsonString(family));
            source.put("importForm", new BsonString("typeImportedName"));
            semantic.extra.put("source", source);
            semantics.put(propertyKey, semantic);
        }
    }

    private static void addReferenceBundleSemantics(
            @Nonnull Map<String, BsonDocument> schemaDocuments,
            @Nonnull Map<String, BsonDocument> propertyNodes,
            @Nonnull Map<String, SemanticRecord> semantics) {
        for (BundleConsumerRule rule : DECIMAL_CONSTANT_CONSUMER_RULES) {
            if (!propertyNodes.containsKey(rule.propertyKey)) {
                continue;
            }

            SemanticRecord semantic = new SemanticRecord(rule.propertyKey, "symbolReference");
            semantic.valueShape = "string";
            semantic.extra.put("target", new BsonString("value"));
            BsonDocument source = new BsonDocument();
            source.put("kind", new BsonString("referenceBundle"));
            source.put("bundleType", new BsonString("DecimalConstants"));
            semantic.extra.put("source", source);
            semantics.put(rule.propertyKey, semantic);
        }

        for (String propertyKey : findDecimalConstantDefinitionPropertyKeys(schemaDocuments)) {
            if (!propertyNodes.containsKey(propertyKey)) {
                continue;
            }
            if (semantics.containsKey(propertyKey)) {
                continue;
            }

            SemanticRecord semantic = new SemanticRecord(propertyKey, "symbolDefinition");
            semantic.valueShape = "string";
            BsonDocument namespace = new BsonDocument();
            namespace.put("kind", new BsonString("referenceBundle"));
            namespace.put("bundleType", new BsonString("DecimalConstants"));
            semantic.extra.put("namespace", namespace);
            semantic.extra.put("valueField", new BsonString("Value"));
            semantics.put(propertyKey, semantic);
        }
    }

    private static void addHiddenRegistrySemantics(
            @Nonnull Map<String, BsonDocument> propertyNodes,
            @Nonnull Map<String, SemanticRecord> semantics) {
        for (HiddenRegistryRule rule : HIDDEN_REGISTRY_RULES) {
            if (!propertyNodes.containsKey(rule.propertyKey)) {
                continue;
            }

            SemanticRecord semantic = new SemanticRecord(rule.propertyKey, "symbolReference");
            semantic.valueShape = "string";
            semantic.extra.put("target", new BsonString("value"));
            semantic.extra.put("source", sourceRegistryDomain(rule.domain));
            semantics.put(rule.propertyKey, semantic);
        }
    }

    private static void addDiscriminatorSemantics(
            @Nonnull Map<String, BsonDocument> schemaDocuments,
            @Nonnull Map<String, BsonDocument> propertyNodes,
            @Nonnull Map<String, SemanticRecord> semantics) {
        for (Entry<String, BsonDocument> entry : schemaDocuments.entrySet()) {
            indexDiscriminatorSemanticsRecursive(entry.getKey(), "", entry.getValue(), propertyNodes, semantics);
        }
    }

    private static void indexDiscriminatorSemanticsRecursive(
            @Nonnull String schemaFile,
            @Nonnull String pointer,
            @Nonnull BsonValue value,
            @Nonnull Map<String, BsonDocument> propertyNodes,
            @Nonnull Map<String, SemanticRecord> semantics) {
        if (value.isDocument()) {
            BsonDocument document = value.asDocument();
            BsonDocument typeField = getDocument(document, "hytaleSchemaTypeField");
            if (typeField != null) {
                String propertyName = stringValue(typeField, "property");
                List<String> values = bsonStringArray(typeField.get("values"));
                if (propertyName != null && !propertyName.isBlank() && !values.isEmpty()) {
                    String propertyPointer = appendJsonPointer(pointer, "properties") + "/"
                            + escapeJsonPointer(propertyName);
                    String propertyKey = schemaFile + "#" + propertyPointer;
                    if (propertyNodes.containsKey(propertyKey) && !semantics.containsKey(propertyKey)) {
                        SemanticRecord semantic = new SemanticRecord(propertyKey, "literalChoice");
                        semantic.valueShape = "string";
                        semantic.extra.put("values", toStringBsonArray(values));
                        semantic.extra.put("role", new BsonString("discriminator"));
                        String defaultValue = stringValue(typeField, "defaultValue");
                        if (defaultValue != null) {
                            semantic.extra.put("defaultValue", new BsonString(defaultValue));
                        }
                        String parentPropertyKey = stringValue(typeField, "parentPropertyKey");
                        if (parentPropertyKey != null) {
                            semantic.extra.put("parentPropertyKey", new BsonString(parentPropertyKey));
                        }
                        semantics.put(propertyKey, semantic);
                    }
                }
            }

            List<String> keys = new ArrayList<>(document.keySet());
            Collections.sort(keys);
            for (String key : keys) {
                BsonValue child = document.get(key);
                if (child != null) {
                    indexDiscriminatorSemanticsRecursive(
                            schemaFile,
                            appendJsonPointer(pointer, key),
                            child,
                            propertyNodes,
                            semantics);
                }
            }
            return;
        }

        if (value.isArray()) {
            BsonArray array = value.asArray();
            for (int i = 0; i < array.size(); i++) {
                indexDiscriminatorSemanticsRecursive(
                        schemaFile,
                        appendJsonPointer(pointer, String.valueOf(i)),
                        array.get(i),
                        propertyNodes,
                        semantics);
            }
        }
    }

    @Nonnull
    private static Set<String> findDecimalConstantDefinitionPropertyKeys(
            @Nonnull Map<String, BsonDocument> schemaDocuments) {
        Set<String> keys = new LinkedHashSet<>();

        BsonDocument common = schemaDocuments.get("common.json");
        if (common == null) {
            return keys;
        }

        BsonDocument decimalDefinition = getPathDocument(common,
                "definitions",
                "DecimalConstantsFrameworkAsset",
                "properties",
                "Entries",
                "items");
        if (decimalDefinition == null) {
            return keys;
        }

        String ref = stringValue(decimalDefinition, "$ref");
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

    private static void augmentSchemasStage(
            @Nonnull Map<String, BsonDocument> schemaDocuments,
            @Nonnull Map<String, SemanticRecord> semanticsByPropertyKey) {
        for (SemanticRecord semantic : semanticsByPropertyKey.values()) {
            String[] split = semantic.propertyKey.split("#", 2);
            if (split.length != 2) {
                continue;
            }

            String schemaFile = split[0];
            String pointer = split[1];
            BsonDocument schema = schemaDocuments.get(schemaFile);
            if (schema == null) {
                continue;
            }

            BsonDocument propertyNode = resolveDocumentPointer(schema, pointer);
            if (propertyNode == null) {
                continue;
            }

            BsonDocument mirrored = semantic.toBsonDocument();
            mirrored.remove("propertyKey");
            propertyNode.put("hytaleDevtools", mirrored);
        }
    }

    @Nonnull
    private static List<IndexShard> extractReferenceIndexesStage(
            @Nonnull AssetStore<?, ?, ?>[] stores,
            @Nonnull Map<String, BsonDocument> schemaDocuments,
            @Nonnull Map<String, BsonDocument> propertyNodes) {
        Map<String, BsonArray> exportsByFamilyRaw = buildExportsByFamily(stores);
        Map<String, BsonArray> registeredAssetsRaw = buildRegisteredAssets(stores);
        Map<String, BsonValue> referenceBundleByKind = buildReferenceBundleByKind(stores);
        Map<String, BsonArray> localizationKeysRaw = buildLocalizationKeys(stores);
        Map<String, BsonArray> cosmeticsByTypeRaw = buildCosmeticsByType(stores, propertyNodes);
        Map<String, BsonArray> uiDataSetsRaw = buildUiDataSets(stores, schemaDocuments, propertyNodes);
        BsonDocument commonAssetsByParentDirectory = buildCommonAssetsByParentDirectory(stores);

        Map<String, BsonValue> exportsByFamily = simplifyExportsByFamilyValueMaps(exportsByFamilyRaw);
        Map<String, BsonValue> registeredAssets = simplifyRegisteredAssetsValueMaps(registeredAssetsRaw);
        Map<String, BsonValue> localizationKeys = simplifyLocalizationValueMaps(localizationKeysRaw);
        Map<String, BsonValue> cosmeticsByType = simplifyToStringListValues(cosmeticsByTypeRaw);
        Map<String, BsonValue> uiDataSets = simplifyToStringListValues(uiDataSetsRaw);

        List<IndexShard> shards = new ArrayList<>();
        addIndexShards(shards, "exportsByFamily", "exportFamilies", exportsByFamily);
        addIndexShards(shards, "registeredAssets", "registeredAssets", registeredAssets);
        addIndexShards(shards, "referenceBundle", "referenceBundle", referenceBundleByKind);
        addIndexShards(shards, "localizationKeys", "localization", localizationKeys);
        addIndexShards(shards, "cosmeticsByType", "cosmeticDomain", cosmeticsByType);
        addIndexShards(shards, "uiDataSets", "uiDataSet", uiDataSets);
        shards.add(new IndexShard(
                "commonAssetsByRoot",
                "all",
                INDEXES_DIRECTORY + "/assetPaths/common.json",
                commonAssetsByParentDirectory));
        return shards;
    }

    private static void addIndexShards(
            @Nonnull List<IndexShard> shards,
            @Nonnull String indexKind,
            @Nonnull String directory,
            @Nonnull Map<String, BsonValue> valuesByKey) {
        for (Entry<String, BsonValue> entry : valuesByKey.entrySet()) {
            String key = entry.getKey();
            String fileName = sanitizeIndexKey(key) + ".json";
            String relativePath = INDEXES_DIRECTORY + "/" + directory + "/" + fileName;
            shards.add(new IndexShard(indexKind, key, relativePath, entry.getValue()));
        }
    }

    @Nonnull
    private static Map<String, BsonValue> simplifyToStringListValues(@Nonnull Map<String, BsonArray> rawValuesByKey) {
        Map<String, BsonValue> result = new TreeMap<>();
        for (Entry<String, BsonArray> entry : rawValuesByKey.entrySet()) {
            result.put(entry.getKey(), extractUniqueNames(entry.getValue()));
        }
        return result;
    }

    @Nonnull
    private static Map<String, BsonValue> simplifyRegisteredAssetsValueMaps(
            @Nonnull Map<String, BsonArray> rawValuesByKey) {
        Map<String, BsonValue> result = new TreeMap<>();
        for (Entry<String, BsonArray> entry : rawValuesByKey.entrySet()) {
            BsonDocument values = new BsonDocument();
            for (BsonValue raw : entry.getValue()) {
                if (!raw.isDocument()) {
                    continue;
                }

                BsonDocument document = raw.asDocument();
                String name = nullableStringValue(document, "name");
                if (name == null || name.isBlank() || values.containsKey(name)) {
                    continue;
                }

                String file = nullableStringValue(document, "file");
                BsonDocument details = new BsonDocument();
                details.put("sourcedFromFile", file == null ? BsonNull.VALUE : new BsonString(file));
                values.put(name, details);
            }
            result.put(entry.getKey(), values);
        }
        return result;
    }

    @Nonnull
    private static Map<String, BsonValue> simplifyExportsByFamilyValueMaps(
            @Nonnull Map<String, BsonArray> rawValuesByKey) {
        Map<String, BsonValue> result = new TreeMap<>();
        for (Entry<String, BsonArray> entry : rawValuesByKey.entrySet()) {
            BsonDocument values = new BsonDocument();
            for (BsonValue raw : entry.getValue()) {
                if (!raw.isDocument()) {
                    continue;
                }

                BsonDocument document = raw.asDocument();
                String name = nullableStringValue(document, "name");
                if (name == null || name.isBlank() || values.containsKey(name)) {
                    continue;
                }

                String file = nullableStringValue(document, "file");
                BsonDocument details = new BsonDocument();
                details.put("sourcedFromFile", file == null ? BsonNull.VALUE : new BsonString(file));
                values.put(name, details);
            }
            result.put(entry.getKey(), values);
        }
        return result;
    }

    @Nonnull
    private static Map<String, BsonValue> buildReferenceBundleByKind(@Nonnull AssetStore<?, ?, ?>[] stores) {
        Map<String, BsonArray> decimalConstantsByWorldStructureRaw = buildDecimalConstantsByWorldStructure(stores);
        BsonArray mergedDecimalConstants = new BsonArray();
        for (BsonArray worldValues : decimalConstantsByWorldStructureRaw.values()) {
            for (BsonValue raw : worldValues) {
                mergedDecimalConstants.add(raw);
            }
        }

        Map<String, BsonValue> result = new TreeMap<>();
        if (!mergedDecimalConstants.isEmpty()) {
            result.put("DecimalConstants", extractUniqueNames(mergedDecimalConstants));
        }
        return result;
    }

    @Nonnull
    private static Map<String, BsonValue> simplifyLocalizationValueMaps(
            @Nonnull Map<String, BsonArray> rawValuesByKey) {
        Map<String, BsonValue> result = new TreeMap<>();
        for (Entry<String, BsonArray> entry : rawValuesByKey.entrySet()) {
            BsonDocument values = new BsonDocument();
            for (BsonValue raw : entry.getValue()) {
                if (!raw.isDocument()) {
                    continue;
                }
                BsonDocument document = raw.asDocument();
                String name = nullableStringValue(document, "name");
                if (name == null || name.isBlank() || values.containsKey(name)) {
                    continue;
                }

                String translation = nullableStringValue(document, "translation");
                values.put(name, translation == null ? BsonNull.VALUE : new BsonString(translation));
            }
            result.put(entry.getKey(), values);
        }
        return result;
    }

    @Nonnull
    private static BsonArray extractUniqueNames(@Nonnull BsonArray rawValues) {
        LinkedHashSet<String> names = new LinkedHashSet<>();

        for (BsonValue raw : rawValues) {
            if (raw.isString()) {
                String value = raw.asString().getValue();
                if (!value.isBlank()) {
                    names.add(value);
                }
                continue;
            }

            if (!raw.isDocument()) {
                continue;
            }

            String name = nullableStringValue(raw.asDocument(), "name");
            if (name != null && !name.isBlank()) {
                names.add(name);
            }
        }

        BsonArray values = new BsonArray();
        for (String name : names) {
            values.add(new BsonString(name));
        }
        return values;
    }

    @Nonnull
    private static Map<String, BsonArray> buildExportsByFamily(@Nonnull AssetStore<?, ?, ?>[] stores) {
        Map<String, List<ValueRecord>> tempByFamily = new TreeMap<>();

        for (AssetStore<?, ?, ?> store : stores) {
            Map<?, ?> assetMap = store.getAssetMap().getAssetMap();
            for (Entry<?, ?> entry : assetMap.entrySet()) {
                Path filePath = getPathForKey(store, entry.getKey());
                String file = filePath == null ? null : filePath.toString();
                collectExportRecords(
                        entry.getValue(),
                        file,
                        tempByFamily);
            }
        }

        Map<String, BsonArray> result = new TreeMap<>();
        for (Entry<String, List<ValueRecord>> entry : tempByFamily.entrySet()) {
            entry.getValue().sort(valueRecordComparator());

            BsonArray values = new BsonArray();
            for (ValueRecord record : entry.getValue()) {
                values.add(record.toBsonDocument());
            }
            result.put(entry.getKey(), values);
        }

        return result;
    }

    private static void collectExportRecords(
            @Nullable Object root,
            @Nullable String file,
            @Nonnull Map<String, List<ValueRecord>> recordsByFamily) {
        if (root == null) {
            return;
        }

        Deque<Object> stack = new ArrayDeque<>();
        IdentityHashMap<Object, Boolean> visited = new IdentityHashMap<>();
        stack.push(root);

        while (!stack.isEmpty()) {
            Object current = stack.pop();
            if (current == null || visited.put(current, Boolean.TRUE) != null) {
                continue;
            }

            if (current.getClass().isArray()) {
                int length = Array.getLength(current);
                for (int i = 0; i < length; i++) {
                    Object child = Array.get(current, i);
                    if (child != null) {
                        stack.push(child);
                    }
                }
                continue;
            }

            if (current instanceof Collection<?> collection) {
                for (Object child : collection) {
                    if (child != null) {
                        stack.push(child);
                    }
                }
                continue;
            }

            if (current instanceof Map<?, ?> map) {
                for (Entry<?, ?> mapEntry : map.entrySet()) {
                    Object mapKey = mapEntry.getKey();
                    Object mapValue = mapEntry.getValue();
                    if (mapKey != null) {
                        stack.push(mapKey);
                    }
                    if (mapValue != null) {
                        stack.push(mapValue);
                    }
                }
                continue;
            }

            Class<?> type = current.getClass();
            String family = exportFamilyForType(type);
            if (family != null) {
                String exportName = readStringField(current, "exportName");
                if (exportName != null && !exportName.isEmpty()) {
                    ValueRecord valueRecord = new ValueRecord(exportName, file);
                    recordsByFamily.computeIfAbsent(family, key -> new ArrayList<>()).add(valueRecord);
                }
            }

            if (!isHytaleGeneratorAssetType(type)) {
                continue;
            }

            for (Class<?> cursor = type; cursor != null && cursor != Object.class; cursor = cursor.getSuperclass()) {
                Field[] fields = cursor.getDeclaredFields();
                for (Field field : fields) {
                    if (Modifier.isStatic(field.getModifiers()) || field.getType().isPrimitive()) {
                        continue;
                    }

                    try {
                        field.setAccessible(true);
                        Object child = field.get(current);
                        if (child != null) {
                            stack.push(child);
                        }
                    } catch (Throwable ignored) {
                    }
                }
            }
        }
    }

    @Nullable
    private static String exportFamilyForType(@Nonnull Class<?> type) {
        for (ExportFamilyRule rule : EXPORT_FAMILY_RULES) {
            if (isClassOrSuperclassNamed(type, rule.baseClassName)) {
                return rule.family;
            }
        }
        return null;
    }

    private static boolean isClassOrSuperclassNamed(@Nonnull Class<?> type, @Nonnull String className) {
        for (Class<?> cursor = type; cursor != null && cursor != Object.class; cursor = cursor.getSuperclass()) {
            if (className.equals(cursor.getName())) {
                return true;
            }
        }
        return false;
    }

    private static boolean isHytaleGeneratorAssetType(@Nonnull Class<?> type) {
        return type.getName().startsWith(HYTALE_GENERATOR_ASSETS_PACKAGE_PREFIX);
    }

    @Nonnull
    private static Map<String, BsonArray> buildRegisteredAssets(@Nonnull AssetStore<?, ?, ?>[] stores) {
        Map<String, List<ValueRecord>> byType = new TreeMap<>();
        for (AssetStore<?, ?, ?> store : stores) {
            String type = store.getAssetClass().getSimpleName();
            for (Object key : store.getAssetMap().getAssetMap().keySet()) {
                String name = stringOrNull(key);
                if (name == null) {
                    continue;
                }

                Path filePath = getPathForKey(store, key);
                String file = filePath == null ? null : filePath.toString();
                ValueRecord valueRecord = new ValueRecord(name, file);
                byType.computeIfAbsent(type, ignored -> new ArrayList<>()).add(valueRecord);
            }
        }

        Map<String, BsonArray> result = new TreeMap<>();
        for (Entry<String, List<ValueRecord>> entry : byType.entrySet()) {
            entry.getValue().sort(valueRecordComparator());
            BsonArray array = new BsonArray();
            for (ValueRecord valueRecord : entry.getValue()) {
                array.add(valueRecord.toBsonDocument());
            }
            result.put(entry.getKey(), array);
        }

        return result;
    }

    @Nonnull
    private static Map<String, BsonArray> buildDecimalConstantsByWorldStructure(@Nonnull AssetStore<?, ?, ?>[] stores) {
        AssetStore<?, ?, ?> worldStructureStore = null;
        for (AssetStore<?, ?, ?> store : stores) {
            if ("WorldStructureAsset".equals(store.getAssetClass().getSimpleName())) {
                worldStructureStore = store;
                break;
            }
        }

        if (worldStructureStore == null) {
            return new TreeMap<>();
        }

        Map<String, List<ValueRecord>> byWorldStructure = new TreeMap<>();
        for (Entry<?, ?> entry : worldStructureStore.getAssetMap().getAssetMap().entrySet()) {
            String worldId = stringOrNull(entry.getKey());
            if (worldId == null) {
                continue;
            }

            Object worldAsset = entry.getValue();
            Path worldFilePath = getPathForKey(worldStructureStore, entry.getKey());
            String worldFile = worldFilePath == null ? null : worldFilePath.toString();

            List<DecimalConstantRecord> extracted = new ArrayList<>();
            extractFrameworkDecimalConstants(extracted, worldAsset);
            extractLegacyContentFieldConstants(extracted, worldAsset);

            if (extracted.isEmpty()) {
                continue;
            }

            List<ValueRecord> records = byWorldStructure.computeIfAbsent(worldId, ignored -> new ArrayList<>());
            for (DecimalConstantRecord record : extracted) {
                ValueRecord valueRecord = new ValueRecord(record.name, worldFile);
                records.add(valueRecord);
            }
        }

        Map<String, BsonArray> result = new TreeMap<>();
        for (Entry<String, List<ValueRecord>> entry : byWorldStructure.entrySet()) {
            entry.getValue().sort(valueRecordComparator());
            BsonArray array = new BsonArray();
            for (ValueRecord valueRecord : entry.getValue()) {
                array.add(valueRecord.toBsonDocument());
            }
            result.put(entry.getKey(), array);
        }

        return result;
    }

    private static void extractFrameworkDecimalConstants(@Nonnull List<DecimalConstantRecord> output,
            @Nonnull Object worldAsset) {
        Object frameworks = readReflectiveField(worldAsset, "frameworkAssets");
        if (frameworks == null || !frameworks.getClass().isArray()) {
            return;
        }

        int frameworkCount = Array.getLength(frameworks);
        for (int frameworkIndex = 0; frameworkIndex < frameworkCount; frameworkIndex++) {
            Object framework = Array.get(frameworks, frameworkIndex);
            if (framework == null || !framework.getClass().getSimpleName().contains("DecimalConstantsFrameworkAsset")) {
                continue;
            }

            Object entries = readReflectiveField(framework, "entryAssets");
            if (entries == null || !entries.getClass().isArray()) {
                continue;
            }

            int entryCount = Array.getLength(entries);
            for (int entryIndex = 0; entryIndex < entryCount; entryIndex++) {
                Object entry = Array.get(entries, entryIndex);
                if (entry == null) {
                    continue;
                }

                String name = readStringField(entry, "name");
                if (name == null || name.isEmpty()) {
                    continue;
                }

                output.add(new DecimalConstantRecord(name));
            }
        }
    }

    private static void extractLegacyContentFieldConstants(@Nonnull List<DecimalConstantRecord> output,
            @Nonnull Object worldAsset) {
        Object contentFields = readReflectiveField(worldAsset, "contentFieldAssets");
        if (contentFields == null || !contentFields.getClass().isArray()) {
            return;
        }

        int count = Array.getLength(contentFields);
        for (int i = 0; i < count; i++) {
            Object contentField = Array.get(contentFields, i);
            if (contentField == null
                    || !contentField.getClass().getSimpleName().contains("BaseHeightContentFieldAsset")) {
                continue;
            }

            String name = readStringField(contentField, "name");
            if (name == null || name.isEmpty()) {
                continue;
            }

            output.add(new DecimalConstantRecord(name));
        }
    }

    @Nonnull
    private static Map<String, BsonArray> buildLocalizationKeys(@Nonnull AssetStore<?, ?, ?>[] stores) {
        Set<Path> packRoots = collectPackRoots(stores);
        if (packRoots.isEmpty()) {
            return new TreeMap<>();
        }

        Set<Path> languageFiles = new TreeSet<>();
        for (Path root : packRoots) {
            collectLanguageFiles(languageFiles, root.resolve("Server").resolve("Languages"));
            collectLanguageFiles(languageFiles, root.resolve("Common").resolve("Languages"));
        }

        collectLanguageFilesFromAssetTypeHandlers(languageFiles);

        Map<String, List<ValueRecord>> byLocale = new TreeMap<>();
        for (Path file : languageFiles) {
            parseLangFile(file, byLocale);
        }

        Map<String, BsonArray> result = new TreeMap<>();
        for (Entry<String, List<ValueRecord>> entry : byLocale.entrySet()) {
            entry.getValue().sort(valueRecordComparator());

            BsonArray array = new BsonArray();
            for (ValueRecord valueRecord : entry.getValue()) {
                array.add(valueRecord.toBsonDocument());
            }
            result.put(entry.getKey(), array);
        }
        return result;
    }

    @Nonnull
    private static Map<String, BsonArray> buildCosmeticsByType(
            @Nonnull AssetStore<?, ?, ?>[] stores,
            @Nonnull Map<String, BsonDocument> propertyNodes) {
        Set<String> domains = collectCosmeticDomains(propertyNodes);
        if (domains.isEmpty()) {
            return new TreeMap<>();
        }

        Map<String, List<ValueRecord>> byDomain = new TreeMap<>();
        for (String domain : domains) {
            List<ValueRecord> records = collectRegistryStyleValuesForDomain(stores, domain);
            if (!records.isEmpty()) {
                byDomain.put(domain, records);
            }
        }

        Map<String, BsonArray> result = new TreeMap<>();
        for (Entry<String, List<ValueRecord>> entry : byDomain.entrySet()) {
            entry.getValue().sort(valueRecordComparator());
            BsonArray array = new BsonArray();
            for (ValueRecord valueRecord : entry.getValue()) {
                array.add(valueRecord.toBsonDocument());
            }
            result.put(entry.getKey(), array);
        }
        return result;
    }

    @Nonnull
    private static Set<String> collectCosmeticDomains(@Nonnull Map<String, BsonDocument> propertyNodes) {
        Set<String> domains = new TreeSet<>();
        for (BsonDocument property : propertyNodes.values()) {
            String domain = stringValue(property, "hytaleCosmeticAsset");
            if (domain != null && !domain.isBlank()) {
                domains.add(domain);
            }
        }
        return domains;
    }

    @Nonnull
    private static Map<String, BsonArray> buildUiDataSets(
            @Nonnull AssetStore<?, ?, ?>[] stores,
            @Nonnull Map<String, BsonDocument> schemaDocuments,
            @Nonnull Map<String, BsonDocument> propertyNodes) {
        Set<String> dataSets = collectUiDataSetNames(schemaDocuments, propertyNodes);
        if (dataSets.isEmpty()) {
            return new TreeMap<>();
        }

        Map<String, List<ValueRecord>> byDataSet = new TreeMap<>();
        for (String dataSet : dataSets) {
            List<ValueRecord> records = new ArrayList<>();

            if ("BlockGroups".equals(dataSet)) {
                records.addAll(collectFieldBackedValueRecords(stores, "group"));
            }

            if ("ItemCategories".equals(dataSet)) {
                records.addAll(collectFieldBackedValueRecords(stores, "category"));
                records.addAll(collectCollectionBackedValueRecords(stores, "categories"));
            }

            if ("GradientSets".equals(dataSet)) {
                records.addAll(collectFieldBackedValueRecords(stores, "gradientSet"));
            }

            if ("GradientIds".equals(dataSet)) {
                records.addAll(collectFieldBackedValueRecords(stores, "gradientId"));
            }

            if (records.isEmpty()) {
                records.addAll(collectRegistryStyleValuesForDomain(stores, dataSet));
            }

            if (records.isEmpty()) {
                continue;
            }

            records.sort(valueRecordComparator());
            byDataSet.put(dataSet, records);
        }

        Map<String, BsonArray> result = new TreeMap<>();
        for (Entry<String, List<ValueRecord>> entry : byDataSet.entrySet()) {
            BsonArray array = new BsonArray();
            for (ValueRecord valueRecord : entry.getValue()) {
                array.add(valueRecord.toBsonDocument());
            }
            result.put(entry.getKey(), array);
        }
        return result;
    }

    @Nonnull
    private static Set<String> collectUiDataSetNames(
            @Nonnull Map<String, BsonDocument> schemaDocuments,
            @Nonnull Map<String, BsonDocument> propertyNodes) {
        Set<String> dataSets = new TreeSet<>();

        for (BsonDocument schema : schemaDocuments.values()) {
            collectUiDataSetNamesRecursive(schema, dataSets);
        }

        for (BsonDocument property : propertyNodes.values()) {
            UiDataSetInfo info = findUiDataSetInfo(property);
            if (info != null) {
                dataSets.add(info.dataSet);
            }
        }
        return dataSets;
    }

    private static void collectUiDataSetNamesRecursive(@Nonnull BsonValue value, @Nonnull Set<String> output) {
        if (value.isDocument()) {
            BsonDocument document = value.asDocument();
            UiDataSetInfo info = findUiDataSetInfo(document);
            if (info != null) {
                output.add(info.dataSet);
            }
            for (BsonValue child : document.values()) {
                if (child != null) {
                    collectUiDataSetNamesRecursive(child, output);
                }
            }
            return;
        }

        if (value.isArray()) {
            for (BsonValue child : value.asArray()) {
                if (child != null) {
                    collectUiDataSetNamesRecursive(child, output);
                }
            }
        }
    }

    @Nonnull
    private static List<ValueRecord> collectRegistryStyleValuesForDomain(
            @Nonnull AssetStore<?, ?, ?>[] stores,
            @Nonnull String domain) {
        String domainNormalized = normalizeToken(domain);
        List<ValueRecord> records = new ArrayList<>();

        for (AssetStore<?, ?, ?> store : stores) {
            if (store.getKeyClass() != String.class) {
                continue;
            }

            String className = store.getAssetClass().getSimpleName();
            String family = familyName(className);
            Set<String> aliases = new HashSet<>();
            aliases.add(className);
            aliases.add(family);
            aliases.add(family + "s");
            if (family.endsWith("y") && family.length() > 1) {
                aliases.add(family.substring(0, family.length() - 1) + "ies");
            }

            boolean matchesDomain = aliases.stream().map(AssetRegistryExportService::normalizeToken)
                    .anyMatch(domainNormalized::equals);
            if (!matchesDomain) {
                continue;
            }

            for (Object key : store.getAssetMap().getAssetMap().keySet()) {
                String name = stringOrNull(key);
                if (name == null) {
                    continue;
                }

                Path filePath = getPathForKey(store, key);
                String file = filePath == null ? null : filePath.toString();
                ValueRecord record = new ValueRecord(name, file);
                records.add(record);
            }
        }

        return records;
    }

    @Nonnull
    private static List<ValueRecord> collectFieldBackedValueRecords(
            @Nonnull AssetStore<?, ?, ?>[] stores,
            @Nonnull String fieldName) {
        List<ValueRecord> records = new ArrayList<>();
        for (AssetStore<?, ?, ?> store : stores) {
            for (Entry<?, ?> entry : store.getAssetMap().getAssetMap().entrySet()) {
                String value = readStringField(entry.getValue(), fieldName);
                if (value == null || value.isBlank()) {
                    continue;
                }

                Path filePath = getPathForKey(store, entry.getKey());
                String file = filePath == null ? null : filePath.toString();
                ValueRecord record = new ValueRecord(value, file);
                records.add(record);
            }
        }
        return records;
    }

    @Nonnull
    private static List<ValueRecord> collectCollectionBackedValueRecords(
            @Nonnull AssetStore<?, ?, ?>[] stores,
            @Nonnull String fieldName) {
        List<ValueRecord> records = new ArrayList<>();
        for (AssetStore<?, ?, ?> store : stores) {
            for (Entry<?, ?> entry : store.getAssetMap().getAssetMap().entrySet()) {
                Object fieldValue = readReflectiveField(entry.getValue(), fieldName);
                if (fieldValue == null) {
                    continue;
                }

                List<String> values = new ArrayList<>();
                if (fieldValue instanceof Collection<?> collection) {
                    for (Object item : collection) {
                        String asString = stringOrNull(item);
                        if (asString != null && !asString.isBlank()) {
                            values.add(asString);
                        }
                    }
                } else if (fieldValue.getClass().isArray()) {
                    int length = Array.getLength(fieldValue);
                    for (int i = 0; i < length; i++) {
                        String asString = stringOrNull(Array.get(fieldValue, i));
                        if (asString != null && !asString.isBlank()) {
                            values.add(asString);
                        }
                    }
                }

                if (values.isEmpty()) {
                    continue;
                }

                Path filePath = getPathForKey(store, entry.getKey());
                String file = filePath == null ? null : filePath.toString();

                for (String value : values) {
                    ValueRecord record = new ValueRecord(value, file);
                    records.add(record);
                }
            }
        }
        return records;
    }

    @Nonnull
    private static BsonDocument buildCommonAssetsByParentDirectory(@Nonnull AssetStore<?, ?, ?>[] stores) {
        Set<Path> packRoots = collectPackRoots(stores);
        if (packRoots.isEmpty()) {
            return new BsonDocument();
        }

        Map<String, Map<String, Set<String>>> byParentByType = new TreeMap<>();

        for (Path packRoot : packRoots) {
            if (!Files.isDirectory(packRoot)) {
                continue;
            }

            try (Stream<Path> stream = Files.walk(packRoot, Integer.MAX_VALUE, FileVisitOption.FOLLOW_LINKS)) {
                stream.filter(Files::isRegularFile).forEach(path -> {
                    String relativeToPack = packRoot.relativize(path).toString().replace('\\', '/');
                    if (!relativeToPack.startsWith("Common/")) {
                        return;
                    }

                    String relative = relativeToPack.substring("Common/".length());
                    if (relative.isBlank()) {
                        return;
                    }

                    int slash = relative.lastIndexOf('/');
                    String parent = slash > 0 ? relative.substring(0, slash) : ".";
                    String fileName = slash >= 0 ? relative.substring(slash + 1) : relative;
                    if (fileName.isBlank()) {
                        return;
                    }

                    String fileType = resolveFileType(fileName);
                    byParentByType
                            .computeIfAbsent(parent, ignored -> new TreeMap<>())
                            .computeIfAbsent(fileType, ignored -> new TreeSet<>())
                            .add(fileName);
                });
            } catch (IOException ignored) {
                // Best-effort collection.
            }
        }

        BsonDocument values = new BsonDocument();
        for (Entry<String, Map<String, Set<String>>> parentEntry : byParentByType.entrySet()) {
            BsonDocument byType = new BsonDocument();
            for (Entry<String, Set<String>> typeEntry : parentEntry.getValue().entrySet()) {
                BsonArray files = new BsonArray();
                for (String file : typeEntry.getValue()) {
                    files.add(new BsonString(file));
                }
                byType.put(typeEntry.getKey(), files);
            }
            values.put(parentEntry.getKey(), byType);
        }
        return values;
    }

    @Nonnull
    private static String resolveFileType(@Nonnull String fileName) {
        int dot = fileName.lastIndexOf('.');
        if (dot <= 0 || dot == fileName.length() - 1) {
            return "no_extension";
        }
        return fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    @Nonnull
    private static Set<Path> collectPackRoots(@Nonnull AssetStore<?, ?, ?>[] stores) {
        Set<Path> roots = new HashSet<>();

        for (AssetStore<?, ?, ?> store : stores) {
            for (Object key : store.getAssetMap().getAssetMap().keySet()) {
                Path filePath = getPathForKey(store, key);
                if (filePath == null) {
                    continue;
                }

                Path root = resolvePackRoot(filePath);
                if (root == null) {
                    continue;
                }

                roots.add(root.normalize());
            }
        }

        return roots;
    }

    @Nullable
    private static Path resolvePackRoot(@Nonnull Path filePath) {
        Path current = filePath.toAbsolutePath().normalize();
        while (current != null) {
            Path fileName = current.getFileName();
            if (fileName != null) {
                String segment = fileName.toString();
                if ("Server".equals(segment)) {
                    return current.getParent();
                }
            }
            current = current.getParent();
        }
        return null;
    }

    private static void collectLanguageFiles(@Nonnull Set<Path> output, @Nonnull Path languageRoot) {
        if (!Files.isDirectory(languageRoot)) {
            return;
        }

        try (Stream<Path> stream = Files.walk(languageRoot, Integer.MAX_VALUE, FileVisitOption.FOLLOW_LINKS)) {
            stream.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".lang"))
                    .forEach(path -> output.add(path.toAbsolutePath().normalize()));
        } catch (IOException ignored) {
        }
    }

    private static void collectLanguageFilesFromAssetTypeHandlers(@Nonnull Set<Path> output) {
        AssetEditorPlugin assetEditorPlugin = AssetEditorPlugin.get();
        if (assetEditorPlugin == null) {
            return;
        }

        for (AssetTypeHandler handler : assetEditorPlugin.getAssetTypeRegistry().getRegisteredAssetTypeHandlers()
                .values()) {
            if (handler instanceof AssetStoreTypeHandler) {
                continue;
            }

            AssetEditorAssetType config = handler.getConfig();
            if (config == null || config.id == null || !"Language".equalsIgnoreCase(config.id)) {
                continue;
            }

            Path root = handler.getRootPath();
            if (!root.isAbsolute()) {
                root = root.toAbsolutePath().normalize();
            }
            collectLanguageFiles(output, root);
        }
    }

    private static void parseLangFile(
            @Nonnull Path file,
            @Nonnull Map<String, List<ValueRecord>> byLocale) {
        List<String> lines;
        try {
            lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException ignored) {
            return;
        }

        LangPathInfo pathInfo = resolveLangPathInfo(file);
        if (pathInfo == null) {
            return;
        }

        Deque<PendingLine> pending = new ArrayDeque<>();
        for (int i = 0; i < lines.size(); i++) {
            String raw = lines.get(i);
            if (i == 0 && !raw.isEmpty() && raw.charAt(0) == '\uFEFF') {
                raw = raw.substring(1);
            }

            if (pending.isEmpty()) {
                pending.push(new PendingLine(raw));
            } else {
                PendingLine current = pending.pop();
                current.content = current.content + raw;
                pending.push(current);
            }

            PendingLine current = pending.peek();
            if (current == null) {
                continue;
            }

            if (current.content.endsWith("\\")) {
                current.content = current.content.substring(0, current.content.length() - 1);
                continue;
            }

            PendingLine completed = pending.pop();
            String line = completed.content;
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }

            int equalsIndex = line.indexOf('=');
            if (equalsIndex <= 0) {
                continue;
            }

            String localKey = line.substring(0, equalsIndex).trim();
            if (localKey.isEmpty()) {
                continue;
            }

            String translation = normalizeLangTranslation(line.substring(equalsIndex + 1));
            String fullKey = pathInfo.prefix.isEmpty() ? localKey : pathInfo.prefix + "." + localKey;
            ValueRecord record = new ValueRecord(fullKey, file.toString());
            record.extra.put("translation", new BsonString(translation));

            byLocale.computeIfAbsent(pathInfo.locale, ignored -> new ArrayList<>()).add(record);
        }
    }

    @Nonnull
    private static String normalizeLangTranslation(@Nonnull String rawValue) {
        return rawValue.trim();
    }

    @Nullable
    private static LangPathInfo resolveLangPathInfo(@Nonnull Path file) {
        List<String> segments = new ArrayList<>();
        for (Path segment : file.normalize()) {
            segments.add(segment.toString());
        }

        int languagesIndex = -1;
        for (int i = 0; i < segments.size(); i++) {
            if ("Languages".equalsIgnoreCase(segments.get(i))) {
                languagesIndex = i;
                break;
            }
        }

        if (languagesIndex < 0 || languagesIndex + 1 >= segments.size()) {
            return null;
        }

        int firstIndex = languagesIndex + 1;
        String first = segments.get(firstIndex);

        String locale;
        int contentStart;

        if (first.toLowerCase(Locale.ROOT).endsWith(".lang")) {
            locale = "fallback";
            contentStart = firstIndex;
        } else {
            locale = first;
            contentStart = firstIndex + 1;
        }

        if (contentStart >= segments.size()) {
            return null;
        }

        List<String> contentSegments = new ArrayList<>(segments.subList(contentStart, segments.size()));
        String fileName = contentSegments.remove(contentSegments.size() - 1);
        String stem = fileName;
        int dot = stem.lastIndexOf('.');
        if (dot >= 0) {
            stem = stem.substring(0, dot);
        }

        if (!stem.isEmpty()) {
            contentSegments.add(stem);
        }

        String prefix = contentSegments.stream().filter(part -> !part.isBlank()).collect(Collectors.joining("."));
        return new LangPathInfo(locale, prefix);
    }

    @Nonnull
    private static Comparator<ValueRecord> valueRecordComparator() {
        return Comparator.comparing(ValueRecord::name)
                .thenComparing(record -> Objects.requireNonNullElse(record.file, ""));
    }

    private static void writeArtifactsStage(
            @Nonnull Path outputDirectory,
            @Nonnull ExportContext context,
            @Nonnull List<IndexShard> indexShards,
            @Nonnull String hytaleVersion) throws IOException {
        Files.createDirectories(outputDirectory);

        String generatedAt = Instant.now().toString();

        BsonDocument schemaMappingsDocument = new BsonDocument();
        schemaMappingsDocument.put("hytaleVersion", new BsonString(hytaleVersion));
        schemaMappingsDocument.put("generatedAt", new BsonString(generatedAt));
        schemaMappingsDocument.put("schemaMappings", context.schemaMappings);
        writeJson(outputDirectory, SCHEMA_MAPPINGS_FILE, schemaMappingsDocument);
        writeSchemas(outputDirectory, context.schemaDocuments);

        writeIndexArtifacts(outputDirectory, indexShards, generatedAt, hytaleVersion);
    }

    private static void writeIndexArtifacts(
            @Nonnull Path outputDirectory,
            @Nonnull List<IndexShard> indexShards,
            @Nonnull String generatedAt,
            @Nonnull String hytaleVersion) throws IOException {
        Path indexesDirectory = outputDirectory.resolve(INDEXES_DIRECTORY);
        clearDirectoryRecursively(indexesDirectory);
        Files.createDirectories(indexesDirectory);

        for (IndexShard shard : indexShards) {
            BsonDocument shardDocument = new BsonDocument();
            shardDocument.put("hytaleVersion", new BsonString(hytaleVersion));
            shardDocument.put("generatedAt", new BsonString(generatedAt));
            shardDocument.put("indexKind", new BsonString(shard.indexKind));
            shardDocument.put("key", new BsonString(shard.key));
            shardDocument.put("values", shard.values);
            writeJsonRelative(outputDirectory, shard.relativePath, shardDocument);
        }
    }

    private static void cleanupRemovedArtifactsStage(@Nonnull Path dataDirectory) throws IOException {

        for (String legacyBaseName : LEGACY_EXPORT_FILES) {
            deleteFilePair(dataDirectory, legacyBaseName);
        }

        Files.deleteIfExists(dataDirectory.resolve("schemas.bson"));
        Files.deleteIfExists(dataDirectory.resolve("schemaMappings.bson"));
        Files.deleteIfExists(dataDirectory.resolve("schemaMappings.json"));
        Files.deleteIfExists(dataDirectory.resolve("autocomplete_semantics_v1.json"));
        Files.deleteIfExists(dataDirectory.resolve("reference_indexes_v1.json"));
        Files.deleteIfExists(dataDirectory.resolve("autocomplete_semantics_v1.bson"));
        Files.deleteIfExists(dataDirectory.resolve("reference_indexes_v1.bson"));
        deleteFilePair(dataDirectory, "index_manifest");
    }

    private static void deleteFilePair(@Nonnull Path dataDirectory, @Nonnull String baseFileName) throws IOException {
        Files.deleteIfExists(dataDirectory.resolve(baseFileName + ".json"));
        Files.deleteIfExists(dataDirectory.resolve(baseFileName + ".bson"));
    }

    private static void writeJson(@Nonnull Path outputDirectory, @Nonnull String baseFileName,
            @Nonnull BsonDocument document) {
        Path jsonPath = outputDirectory.resolve(baseFileName + ".json");
        BsonUtil.writeDocument(jsonPath, document, false).join();
    }

    private static void writeJsonRelative(@Nonnull Path outputDirectory, @Nonnull String relativePath,
            @Nonnull BsonDocument document) {
        Path jsonPath = outputDirectory.resolve(relativePath);
        try {
            Path parent = jsonPath.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
        } catch (IOException exception) {
            throw new RuntimeException(exception);
        }
        BsonUtil.writeDocument(jsonPath, document, false).join();
    }

    private static void writeSchemas(@Nonnull Path outputDirectory, @Nonnull Map<String, BsonDocument> schemas)
            throws IOException {
        Path schemaDirectory = outputDirectory.resolve(SCHEMAS_DIRECTORY);
        Files.createDirectories(schemaDirectory);
        clearSchemaDirectory(schemaDirectory);

        for (Entry<String, BsonDocument> entry : schemas.entrySet()) {
            Path jsonPath = schemaDirectory.resolve(entry.getKey());
            BsonUtil.writeDocument(jsonPath, entry.getValue(), false).join();
        }
    }

    private static void clearSchemaDirectory(@Nonnull Path schemaDirectory) throws IOException {
        try (Stream<Path> stream = Files.list(schemaDirectory)) {
            stream.filter(Files::isRegularFile)
                    .filter(path -> {
                        String fileName = path.getFileName().toString().toLowerCase(Locale.ROOT);
                        return fileName.endsWith(".json") || fileName.endsWith(".bson");
                    })
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException exception) {
                            throw new RuntimeException(exception);
                        }
                    });
        }
    }

    private static void clearDirectoryRecursively(@Nonnull Path directory) throws IOException {
        if (!Files.exists(directory)) {
            return;
        }
        try (Stream<Path> stream = Files.walk(directory)) {
            stream.sorted(Comparator.reverseOrder())
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException exception) {
                            throw new RuntimeException(exception);
                        }
                    });
        }
    }

    @Nonnull
    private static String resolveHytaleServerVersion() {
        try {
            String version = ManifestUtil.getImplementationVersion();
            if (version != null && !version.isBlank()) {
                return version;
            }
        } catch (Throwable ignored) {
            // Best-effort metadata only.
        }
        return "unknown";
    }

    @Nullable
    private static String findContainedAssetType(@Nonnull BsonDocument propertyNode) {
        return findContainedAssetTypeInNode(propertyNode, "anyOf");
    }

    @Nullable
    private static String findContainedAssetTypeInNode(@Nonnull BsonDocument propertyNode,
            @Nonnull String arrayFieldName) {
        BsonValue anyOf = propertyNode.get(arrayFieldName);
        if (anyOf == null || !anyOf.isArray()) {
            return null;
        }

        for (BsonValue option : anyOf.asArray()) {
            if (!option.isDocument()) {
                continue;
            }

            BsonDocument optionDocument = option.asDocument();
            String assetType = stringValue(optionDocument, "hytaleAssetRef");
            if (assetType == null) {
                continue;
            }

            BsonValue nestedAnyOf = optionDocument.get("anyOf");
            if (nestedAnyOf != null && nestedAnyOf.isArray() && isStringOrRefUnion(nestedAnyOf.asArray())) {
                return assetType;
            }
        }

        return null;
    }

    private static boolean isStringOrRefUnion(@Nonnull BsonArray array) {
        boolean hasString = false;
        boolean hasRef = false;

        for (BsonValue value : array) {
            if (!value.isDocument()) {
                continue;
            }

            BsonDocument document = value.asDocument();
            if ("string".equals(stringValue(document, "type"))) {
                hasString = true;
            }
            if (document.containsKey("$ref")) {
                hasRef = true;
            }
        }

        return hasString && hasRef;
    }

    @Nullable
    private static String findMapKeyDomain(@Nonnull BsonDocument propertyNode) {
        BsonDocument propertyNames = getDocument(propertyNode, "propertyNames");
        if (propertyNames == null) {
            return null;
        }
        return stringValue(propertyNames, "hytaleAssetRef");
    }

    @Nonnull
    private static List<String> findEnumMapAllowedKeys(@Nonnull BsonDocument propertyNode) {
        BsonDocument hytale = getDocument(propertyNode, "hytale");
        if (hytale == null || !"EnumMap".equals(stringValue(hytale, "type"))) {
            return List.of();
        }

        BsonDocument propertyNames = getDocument(propertyNode, "propertyNames");
        if (propertyNames == null) {
            return List.of();
        }
        return bsonStringArray(propertyNames.get("enum"));
    }

    @Nullable
    private static String findRegistryDomain(@Nonnull BsonDocument propertyNode) {
        String ref = stringValue(propertyNode, "hytaleAssetRef");
        if (ref != null && !ref.isBlank()) {
            return ref;
        }

        String customRef = stringValue(propertyNode, "hytaleCustomAssetRef");
        if (customRef != null && !customRef.isBlank()) {
            return customRef;
        }

        return null;
    }

    @Nullable
    private static String resolveColorMode(@Nonnull BsonDocument propertyNode) {
        BsonDocument hytale = getDocument(propertyNode, "hytale");
        if (hytale == null) {
            return null;
        }

        String type = stringValue(hytale, "type");
        if (type == null) {
            return null;
        }

        return switch (type) {
            case "Color" -> "color";
            case "ColorAlpha" -> "colorAlpha";
            case "ColorShort" -> "colorLight";
            default -> null;
        };
    }

    @Nonnull
    private static List<String> findEnumValues(@Nonnull BsonDocument propertyNode) {
        BsonValue enumValue = propertyNode.get("enum");
        if (enumValue == null || !enumValue.isArray()) {
            return List.of();
        }

        return bsonStringArray(enumValue);
    }

    private static boolean isLocalizationProperty(@Nonnull BsonDocument propertyNode) {
        BsonDocument hytale = getDocument(propertyNode, "hytale");
        if (hytale == null) {
            return false;
        }
        BsonDocument uiEditorComponent = getDocument(hytale, "uiEditorComponent");
        return uiEditorComponent != null && "LocalizationKey".equals(stringValue(uiEditorComponent, "component"));
    }

    @Nullable
    private static UiDataSetInfo findUiDataSetInfo(@Nonnull BsonDocument propertyNode) {
        BsonDocument hytale = getDocument(propertyNode, "hytale");
        if (hytale == null) {
            return null;
        }
        BsonDocument uiEditorComponent = getDocument(hytale, "uiEditorComponent");
        if (uiEditorComponent == null) {
            return null;
        }
        String component = stringValue(uiEditorComponent, "component");
        if (!"Text".equals(component) && !"Dropdown".equals(component)) {
            return null;
        }
        String dataSet = stringValue(uiEditorComponent, "dataSet");
        if (dataSet == null || dataSet.isBlank()) {
            return null;
        }
        return new UiDataSetInfo(component, dataSet);
    }

    @Nonnull
    private static BsonDocument sourceRegistryDomain(@Nonnull String domain) {
        BsonDocument source = new BsonDocument();
        source.put("kind", new BsonString("registryDomain"));
        source.put("domain", new BsonString(domain));
        return source;
    }

    @Nonnull
    private static String inferValueShape(@Nonnull BsonDocument propertyNode, @Nonnull String fallback) {
        BsonValue type = propertyNode.get("type");
        if (type != null) {
            if (type.isString()) {
                return mapJsonTypeToValueShape(type.asString().getValue(), fallback);
            }
            if (type.isArray()) {
                boolean hasString = false;
                boolean hasObject = false;
                String first = null;
                for (BsonValue value : type.asArray()) {
                    if (!value.isString()) {
                        continue;
                    }
                    String candidate = value.asString().getValue();
                    if (first == null) {
                        first = candidate;
                    }
                    if ("string".equals(candidate)) {
                        hasString = true;
                    } else if ("object".equals(candidate)) {
                        hasObject = true;
                    }
                }
                if (hasString && hasObject) {
                    return "stringOrObject";
                }
                if (first != null) {
                    return mapJsonTypeToValueShape(first, fallback);
                }
            }
        }
        return fallback;
    }

    @Nonnull
    private static String mapJsonTypeToValueShape(@Nullable String jsonType, @Nonnull String fallback) {
        if (jsonType == null) {
            return fallback;
        }
        return switch (jsonType) {
            case "string" -> "string";
            case "number" -> "number";
            case "integer" -> "integer";
            case "boolean" -> "boolean";
            case "object" -> "object";
            case "array" -> "array";
            case "null" -> "null";
            default -> fallback;
        };
    }

    @Nonnull
    private static String sanitizeIndexKey(@Nonnull String key) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < key.length(); i++) {
            char c = key.charAt(i);
            if (Character.isLetterOrDigit(c) || c == '.' || c == '-' || c == '_') {
                builder.append(c);
            } else {
                builder.append('_');
            }
        }
        String sanitized = builder.toString();
        return sanitized.isBlank() ? "index" : sanitized;
    }

    @Nonnull
    private static String normalizeToken(@Nonnull String value) {
        StringBuilder builder = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (Character.isLetterOrDigit(c)) {
                builder.append(Character.toLowerCase(c));
            }
        }
        return builder.toString();
    }

    @Nullable
    private static BsonDocument resolveDocumentPointer(@Nonnull BsonDocument root, @Nonnull String pointer) {
        if (pointer.isEmpty() || "#".equals(pointer)) {
            return root;
        }

        String normalizedPointer = pointer;
        if (normalizedPointer.startsWith("#")) {
            normalizedPointer = normalizedPointer.substring(1);
        }
        if (normalizedPointer.isEmpty()) {
            return root;
        }
        if (!normalizedPointer.startsWith("/")) {
            return null;
        }

        BsonValue current = root;
        String[] tokens = normalizedPointer.substring(1).split("/");
        for (String token : tokens) {
            String key = unescapeJsonPointer(token);

            if (current == null) {
                return null;
            }

            if (current.isDocument()) {
                current = current.asDocument().get(key);
                continue;
            }

            if (current.isArray()) {
                int index;
                try {
                    index = Integer.parseInt(key);
                } catch (NumberFormatException ignored) {
                    return null;
                }
                BsonArray array = current.asArray();
                if (index < 0 || index >= array.size()) {
                    return null;
                }
                current = array.get(index);
                continue;
            }

            return null;
        }

        return current != null && current.isDocument() ? current.asDocument() : null;
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

    @Nonnull
    private static String familyName(@Nonnull String assetSimpleName) {
        return assetSimpleName.endsWith("Asset")
                ? assetSimpleName.substring(0, assetSimpleName.length() - "Asset".length())
                : assetSimpleName;
    }

    @Nullable
    private static String stringOrNull(@Nullable Object value) {
        return value == null ? null : value.toString();
    }

    @SuppressWarnings({ "rawtypes", "unchecked" })
    @Nullable
    private static Path getPathForKey(@Nonnull AssetStore<?, ?, ?> store, @Nullable Object key) {
        if (key == null) {
            return null;
        }
        try {
            return ((AssetMap) store.getAssetMap()).getPath(key);
        } catch (Throwable ignored) {
            return null;
        }
    }

    @Nullable
    private static String readStringField(@Nullable Object target, @Nonnull String fieldName) {
        Object value = readReflectiveField(target, fieldName);
        return value == null ? null : value.toString();
    }

    @Nullable
    private static Object readReflectiveField(@Nullable Object target, @Nonnull String fieldName) {
        if (target == null) {
            return null;
        }

        for (Class<?> type = target.getClass(); type != null && type != Object.class; type = type.getSuperclass()) {
            try {
                Field field = type.getDeclaredField(fieldName);
                field.setAccessible(true);
                return field.get(target);
            } catch (NoSuchFieldException ignored) {
            } catch (Throwable ignored) {
                return null;
            }
        }
        return null;
    }

    @Nullable
    private static String stringValue(@Nonnull BsonDocument document, @Nonnull String key) {
        BsonValue value = document.get(key);
        return value != null && value.isString() ? value.asString().getValue() : null;
    }

    @Nullable
    private static String nullableStringValue(@Nonnull BsonDocument document, @Nonnull String key) {
        BsonValue value = document.get(key);
        if (value == null || value.isNull()) {
            return null;
        }
        return value.isString() ? value.asString().getValue() : value.toString();
    }

    private static boolean booleanValue(@Nonnull BsonDocument document, @Nonnull String key) {
        BsonValue value = document.get(key);
        return value != null && value.isBoolean() && value.asBoolean().getValue();
    }

    private static int intValue(@Nonnull BsonDocument document, @Nonnull String key, int defaultValue) {
        BsonValue value = document.get(key);
        return value != null && value.isInt32() ? value.asInt32().getValue() : defaultValue;
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
            } else if (!element.isNull()) {
                result.add(element.toString());
            }
        }
        return result;
    }

    @Nonnull
    private static BsonArray toStringBsonArray(@Nonnull List<String> values) {
        BsonArray array = new BsonArray();
        for (String value : values) {
            array.add(new BsonString(value));
        }
        return array;
    }

    @Nonnull
    private static String enumSignature(@Nonnull List<String> values) {
        return String.join("\u001F", values);
    }

    @Nonnull
    private static String appendJsonPointer(@Nonnull String pointer, @Nonnull String token) {
        if (pointer.isEmpty()) {
            return "/" + escapeJsonPointer(token);
        }
        return pointer + "/" + escapeJsonPointer(token);
    }

    @Nonnull
    private static String escapeJsonPointer(@Nonnull String token) {
        return token.replace("~", "~0").replace("/", "~1");
    }

    @Nonnull
    private static String unescapeJsonPointer(@Nonnull String token) {
        return token.replace("~1", "/").replace("~0", "~");
    }

    private static BsonValue nullableString(@Nullable String value) {
        return value == null ? BsonNull.VALUE : new BsonString(value);
    }

    private static final class ExportContext {
        private final BsonDocument schemaMappings;
        private final Map<String, BsonDocument> schemaDocuments;
        private final AssetStore<?, ?, ?>[] stores;

        private ExportContext(
                @Nonnull BsonDocument schemaMappings,
                @Nonnull Map<String, BsonDocument> schemaDocuments,
                @Nonnull AssetStore<?, ?, ?>[] stores) {
            this.schemaMappings = schemaMappings;
            this.schemaDocuments = schemaDocuments;
            this.stores = stores;
        }
    }

    private static final class HiddenRegistryRule {
        private final String propertyKey;
        private final String domain;

        private HiddenRegistryRule(@Nonnull String propertyKey, @Nonnull String domain) {
            this.propertyKey = propertyKey;
            this.domain = domain;
        }
    }

    private static final class BundleConsumerRule {
        private final String propertyKey;

        private BundleConsumerRule(@Nonnull String propertyKey) {
            this.propertyKey = propertyKey;
        }
    }

    private static final class EnumSemanticInfo {
        private String enumClass;
        private String enumStyle;
        private List<String> canonicalValues = List.of();
        private List<String> acceptedValues = List.of();
        private boolean decodeCaseInsensitive;
    }

    private static final class SemanticRecord {
        private final String propertyKey;
        private final String semanticKind;
        private String valueShape = "string";
        private final BsonDocument extra = new BsonDocument();

        private SemanticRecord(@Nonnull String propertyKey, @Nonnull String semanticKind) {
            this.propertyKey = propertyKey;
            this.semanticKind = semanticKind;
        }

        @Nonnull
        private BsonDocument toBsonDocument() {
            BsonDocument document = new BsonDocument();
            document.put("propertyKey", new BsonString(this.propertyKey));
            document.put("semanticKind", new BsonString(this.semanticKind));
            document.put("valueShape", new BsonString(this.valueShape));
            for (Entry<String, BsonValue> entry : this.extra.entrySet()) {
                document.put(entry.getKey(), entry.getValue());
            }
            return document;
        }
    }

    private static final class ValueRecord {
        private final String name;
        private final String file;
        private final BsonDocument extra = new BsonDocument();

        private ValueRecord(
                @Nonnull String name,
                @Nullable String file) {
            this.name = name;
            this.file = file;
        }

        @Nonnull
        private String name() {
            return this.name;
        }

        @Nonnull
        private BsonDocument toBsonDocument() {
            BsonDocument document = new BsonDocument();
            document.put("name", new BsonString(this.name));
            document.put("file", nullableString(this.file));
            for (Entry<String, BsonValue> entry : this.extra.entrySet()) {
                document.put(entry.getKey(), entry.getValue());
            }
            return document;
        }
    }

    private static final class DecimalConstantRecord {
        private final String name;

        private DecimalConstantRecord(@Nonnull String name) {
            this.name = name;
        }
    }

    private static final class UiDataSetInfo {
        private final String component;
        private final String dataSet;

        private UiDataSetInfo(@Nonnull String component, @Nonnull String dataSet) {
            this.component = component;
            this.dataSet = dataSet;
        }
    }

    private static final class ExportFamilyRule {
        private final String family;
        private final String baseClassName;

        private ExportFamilyRule(@Nonnull String family, @Nonnull String baseClassName) {
            this.family = family;
            this.baseClassName = baseClassName;
        }
    }

    private static final class IndexShard {
        private final String indexKind;
        private final String key;
        private final String relativePath;
        private final BsonValue values;

        private IndexShard(
                @Nonnull String indexKind,
                @Nonnull String key,
                @Nonnull String relativePath,
                @Nonnull BsonValue values) {
            this.indexKind = indexKind;
            this.key = key;
            this.relativePath = relativePath;
            this.values = values;
        }
    }

    private static final class LangPathInfo {
        private final String locale;
        private final String prefix;

        private LangPathInfo(@Nonnull String locale, @Nonnull String prefix) {
            this.locale = locale;
            this.prefix = prefix;
        }
    }

    private static final class PendingLine {
        private String content;

        private PendingLine(@Nonnull String content) {
            this.content = content;
        }
    }

    private static final class CodecGraphCollector {
        private final IdentityHashMap<Codec<?>, String> codecIds = new IdentityHashMap<>();
        private final Map<String, BsonDocument> enumTypes = new TreeMap<>();
        private int nextCodecId = 1;

        @Nonnull
        private String collect(@Nonnull Codec<?> codec) {
            String existingId = this.codecIds.get(codec);
            if (existingId != null) {
                return existingId;
            }

            String codecId = "c" + this.nextCodecId++;
            this.codecIds.put(codec, codecId);

            if (codec instanceof EnumCodec<?> enumCodec) {
                registerEnumType(enumCodec);
            }

            for (CodecChild child : getCodecChildren(codec)) {
                this.collect(child.codec);
            }

            return codecId;
        }

        @Nonnull
        private String registerEnumType(@Nonnull EnumCodec<?> enumCodec) {
            Class<?> enumClass = enumClass(enumCodec);
            String enumClassName = enumClass == null ? enumCodec.getClass().getName() : enumClass.getName();
            this.enumTypes.computeIfAbsent(enumClassName, key -> buildEnumTypeDocument(enumCodec, enumClass));
            return enumClassName;
        }

        @Nonnull
        private BsonArray getEnumTypes() {
            BsonArray array = new BsonArray();
            for (BsonDocument enumType : this.enumTypes.values()) {
                array.add(enumType);
            }
            return array;
        }

        @Nullable
        private Class<?> enumClass(@Nonnull EnumCodec<?> enumCodec) {
            Object enumClassObject = readReflectiveField(enumCodec, "clazz");
            return enumClassObject instanceof Class<?> ? (Class<?>) enumClassObject : null;
        }

        @SuppressWarnings({ "rawtypes", "unchecked" })
        @Nonnull
        private BsonDocument buildEnumTypeDocument(@Nonnull EnumCodec<?> enumCodec, @Nullable Class<?> enumClass) {
            BsonDocument document = new BsonDocument();
            document.put("enumClass",
                    new BsonString(enumClass == null ? enumCodec.getClass().getName() : enumClass.getName()));
            if (enumClass != null) {
                document.put("enumSimpleName", new BsonString(enumClass.getSimpleName()));
            }

            String enumStyle = Objects.toString(readReflectiveField(enumCodec, "enumStyle"), "Unknown");
            document.put("enumStyle", new BsonString(enumStyle));

            BsonArray constantNames = new BsonArray();
            BsonArray serializedValues = new BsonArray();
            BsonArray schemaValues = new BsonArray();
            LinkedHashSet<String> acceptedValues = new LinkedHashSet<>();

            Object constantsObject = readReflectiveField(enumCodec, "enumConstants");
            Enum<?>[] constants = constantsObject instanceof Enum<?>[] ? (Enum<?>[]) constantsObject
                    : enumClass == null ? null : (Enum<?>[]) enumClass.getEnumConstants();
            Object keysObject = readReflectiveField(enumCodec, "enumKeys");
            String[] keys = keysObject instanceof String[] ? (String[]) keysObject : null;

            if (constants != null) {
                Codec rawCodec = enumCodec;
                for (int i = 0; i < constants.length; i++) {
                    Enum<?> constant = constants[i];
                    constantNames.add(new BsonString(constant.name()));
                    if ("LEGACY".equals(enumStyle)) {
                        acceptedValues.add(constant.name());
                    }

                    try {
                        BsonValue encoded = rawCodec.encode(constant, EmptyExtraInfo.EMPTY);
                        if (encoded != null && encoded.isString()) {
                            String encodedValue = encoded.asString().getValue();
                            serializedValues.add(new BsonString(encodedValue));
                            acceptedValues.add(encodedValue);
                        }
                    } catch (Throwable ignored) {
                    }

                    if (keys != null && i < keys.length) {
                        String schemaValue = keys[i];
                        schemaValues.add(new BsonString(schemaValue));
                        acceptedValues.add(schemaValue);
                    }
                }
            }

            document.put("constantNames", constantNames);
            document.put("serializedValues", serializedValues);
            document.put("schemaValues", schemaValues);
            document.put("decodeSupportsCaseInsensitiveEnumNames", BsonBoolean.valueOf("LEGACY".equals(enumStyle)));
            document.put("acceptedLiteralValues", toStringBsonArray(new ArrayList<>(acceptedValues)));
            return document;
        }
    }

    private static final class CodecChild {
        private final Codec<?> codec;

        private CodecChild(@Nonnull Codec<?> codec) {
            this.codec = codec;
        }
    }

    @Nonnull
    private static List<CodecChild> getCodecChildren(@Nonnull Codec<?> codec) {
        List<CodecChild> children = new ArrayList<>();

        if (codec instanceof BuilderCodec<?> builderCodec) {
            BuilderCodec<?> parentCodec = builderCodec.getParent();
            if (parentCodec != null) {
                children.add(new CodecChild(parentCodec));
            }

            List<Entry<String, List<BuilderField<?, ?>>>> entries = new ArrayList<>();
            for (Entry<String, List<BuilderField<?, ?>>> entry : castBuilderEntries(builderCodec.getEntries())
                    .entrySet()) {
                entries.add(entry);
            }
            entries.sort(Entry.comparingByKey());
            for (Entry<String, List<BuilderField<?, ?>>> entry : entries) {
                List<BuilderField<?, ?>> fields = new ArrayList<>(entry.getValue());
                fields.sort(Comparator.comparingInt(BuilderField::getMinVersion));
                for (BuilderField<?, ?> field : fields) {
                    Codec<?> childCodec = field.getCodec().getChildCodec();
                    children.add(new CodecChild(childCodec));
                }
            }
        }

        if (codec instanceof ACodecMapCodec<?, ?, ?> mapCodec) {
            List<Object> registeredIds = new ArrayList<>(mapCodec.getRegisteredIds());
            registeredIds.sort(Comparator.comparing(String::valueOf));
            @SuppressWarnings("rawtypes")
            ACodecMapCodec rawMapCodec = (ACodecMapCodec) mapCodec;
            for (Object id : registeredIds) {
                Object childObject = rawMapCodec.getCodecFor(id);
                if (childObject instanceof Codec<?> childCodec) {
                    children.add(new CodecChild(childCodec));
                }
            }

            Object defaultCodec = rawMapCodec.getDefaultCodec();
            if (defaultCodec instanceof Codec<?> childCodec) {
                children.add(new CodecChild(childCodec));
            }
        }

        addReflectionChildren(codec, children);
        return children;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, List<BuilderField<?, ?>>> castBuilderEntries(@Nonnull Map<?, ?> entries) {
        return (Map<String, List<BuilderField<?, ?>>>) entries;
    }

    private static void addReflectionChildren(@Nonnull Codec<?> codec, @Nonnull List<CodecChild> children) {
        for (Class<?> type = codec.getClass(); type != null && type != Object.class; type = type.getSuperclass()) {
            for (Field field : type.getDeclaredFields()) {
                if (Modifier.isStatic(field.getModifiers()) || field.isSynthetic()) {
                    continue;
                }
                if (shouldSkipReflectionField(codec, field.getName())) {
                    continue;
                }
                Object value = readField(codec, field);
                if (value == null) {
                    continue;
                }
                if (value instanceof Codec<?> childCodec) {
                    children.add(new CodecChild(childCodec));
                    continue;
                }
                if (value instanceof KeyedCodec<?> keyedCodec) {
                    children.add(new CodecChild(keyedCodec.getChildCodec()));
                    continue;
                }
                if (value instanceof Object[] array && array.length <= 64) {
                    for (Object entry : array) {
                        if (entry instanceof Codec<?> childCodec) {
                            children.add(new CodecChild(childCodec));
                        }
                    }
                    continue;
                }
                if (value instanceof Collection<?> collection && collection.size() <= 64) {
                    for (Object entry : collection) {
                        if (entry instanceof Codec<?> childCodec) {
                            children.add(new CodecChild(childCodec));
                        }
                    }
                }
            }
        }
    }

    private static boolean shouldSkipReflectionField(@Nonnull Codec<?> codec, @Nonnull String fieldName) {
        if (codec instanceof BuilderCodec<?> && ("entries".equals(fieldName) || "unmodifiableEntries".equals(fieldName)
                || "parentCodec".equals(fieldName))) {
            return true;
        }
        if (codec instanceof ACodecMapCodec<?, ?, ?> && ("idToCodec".equals(fieldName) || "classToId".equals(fieldName)
                || "idToClass".equals(fieldName) || "codecs".equals(fieldName))) {
            return true;
        }
        return false;
    }

    @Nullable
    private static Object readField(@Nonnull Object target, @Nonnull Field field) {
        try {
            field.setAccessible(true);
            return field.get(target);
        } catch (Throwable ignored) {
            return null;
        }
    }
}
