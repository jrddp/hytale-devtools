package kokeria.hytaledevtoolscompanion.assets.index;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Logger;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

import org.bson.BsonArray;
import org.bson.BsonDocument;
import org.bson.BsonString;
import org.bson.BsonValue;

import com.hypixel.hytale.server.core.asset.type.blocktype.config.BlockType;
import com.hypixel.hytale.server.core.modules.item.ItemModule;

import kokeria.hytaledevtoolscompanion.assets.ExportManifestService;

final class UiDataSetIndexExporter {
    private static final Logger LOGGER = Logger.getLogger(UiDataSetIndexExporter.class.getName());
    private static final Set<String> LOGGED_UNKNOWN_DATA_SETS = Collections.synchronizedSet(new HashSet<>());

    private UiDataSetIndexExporter() {
    }

    @Nonnull
    static List<IndexShard> build(
            @Nonnull Map<String, BsonDocument> schemaDocuments,
            @Nonnull List<ExportManifestService.RuntimePackage> runtimePackages) {
        Set<String> referencedDataSets = collectReferencedDataSets(schemaDocuments);
        if (referencedDataSets.isEmpty()) {
            return List.of();
        }

        BsonDocument gradientSets = needsGradientSets(referencedDataSets) ? loadGradientSets(runtimePackages) : null;
        List<IndexShard> shards = new ArrayList<>();
        for (String dataSet : referencedDataSets) {
            boolean knownDataSet = true;
            BsonValue values = switch (dataSet) {
                case "BlockGroups" -> blockGroups();
                case "ItemCategories" -> itemCategories();
                case "GradientSets", "GradientIds" -> null;
                default -> {
                    knownDataSet = false;
                    yield null;
                }
            };

            if (values != null) {
                shards.add(new IndexShard(
                        "uiDataSet",
                        IndexExportUtils.sanitizeIndexKey(dataSet) + ".json",
                        "uiDataSet",
                        dataSet,
                        values,
                        null,
                        null));
            } else if (!knownDataSet && LOGGED_UNKNOWN_DATA_SETS.add(dataSet)) {
                LOGGER.info(String.format("Skipping unsupported uiDataSet export for %s", dataSet));
            }
        }

        if (gradientSets != null) {
            shards.add(new IndexShard(
                    "uiDataSet",
                    "GradientSets.json",
                    "uiDataSet",
                    "GradientSets",
                    gradientSets,
                    null,
                    null));
        }
        return shards;
    }

    private static boolean needsGradientSets(@Nonnull Set<String> referencedDataSets) {
        return referencedDataSets.contains("GradientSets") || referencedDataSets.contains("GradientIds");
    }

    @Nonnull
    private static Set<String> collectReferencedDataSets(@Nonnull Map<String, BsonDocument> schemaDocuments) {
        Set<String> dataSets = new HashSet<>();
        for (BsonDocument schemaDocument : schemaDocuments.values()) {
            collectReferencedDataSetsRecursive(schemaDocument, dataSets);
        }
        return dataSets;
    }

    private static void collectReferencedDataSetsRecursive(@Nonnull BsonValue value, @Nonnull Set<String> dataSets) {
        if (value.isDocument()) {
            BsonDocument document = value.asDocument();
            String dataSet = findUiDataSetKey(document);
            if (dataSet != null) {
                dataSets.add(dataSet);
            }
            for (BsonValue child : document.values()) {
                if (child != null) {
                    collectReferencedDataSetsRecursive(child, dataSets);
                }
            }
            return;
        }

        if (value.isArray()) {
            for (BsonValue child : value.asArray()) {
                if (child != null) {
                    collectReferencedDataSetsRecursive(child, dataSets);
                }
            }
        }
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
    private static BsonArray blockGroups() {
        List<String> groups = new ArrayList<>();
        for (String group : BlockType.getAssetMap().getGroups()) {
            if (group != null && !group.isBlank()) {
                groups.add(group);
            }
        }
        return toStringArray(groups);
    }

    @Nullable
    private static BsonArray itemCategories() {
        ItemModule itemModule = ItemModule.get();
        if (itemModule == null || itemModule.isDisabled()) {
            return null;
        }
        return toStringArray(itemModule.getFlatItemCategoryList());
    }

    @Nullable
    private static BsonDocument loadGradientSets(
            @Nonnull List<ExportManifestService.RuntimePackage> runtimePackages) {
        Path gradientSetsPath = findGradientSetsPath(runtimePackages);
        if (gradientSetsPath == null) {
            return null;
        }

        try {
            BsonArray gradientSets = BsonArray.parse(Files.readString(gradientSetsPath, StandardCharsets.UTF_8));
            BsonDocument gradientSetValues = new BsonDocument();

            for (BsonValue value : gradientSets) {
                if (!value.isDocument()) {
                    continue;
                }

                BsonDocument gradientSet = value.asDocument();
                String setId = stringValue(gradientSet, "Id");
                BsonDocument gradients = getDocument(gradientSet, "Gradients");
                if (setId == null || setId.isBlank() || gradients == null) {
                    continue;
                }

                BsonDocument gradientEntries = new BsonDocument();
                List<String> gradientIds = new ArrayList<>(gradients.keySet());
                Collections.sort(gradientIds);
                for (String gradientId : gradientIds) {
                    BsonValue gradientValue = gradients.get(gradientId);
                    if (gradientValue == null || !gradientValue.isDocument()) {
                        continue;
                    }

                    gradientEntries.put(gradientId, gradientValue.asDocument());
                }

                if (!gradientEntries.isEmpty()) {
                    gradientSetValues.put(setId, gradientEntries);
                }
            }

            return gradientSetValues.isEmpty() ? null : gradientSetValues;
        } catch (IOException | RuntimeException ignored) {
            return null;
        }
    }

    @Nullable
    private static Path findGradientSetsPath(@Nonnull List<ExportManifestService.RuntimePackage> runtimePackages) {
        Path fallback = null;
        for (ExportManifestService.RuntimePackage runtimePackage : runtimePackages) {
            Path candidate = runtimePackage.root().resolve("Cosmetics").resolve("CharacterCreator")
                    .resolve("GradientSets.json");
            if (!Files.isRegularFile(candidate)) {
                continue;
            }
            if ("Hytale:Hytale".equals(runtimePackage.name())) {
                return candidate;
            }
            if (fallback == null) {
                fallback = candidate;
            }
        }
        return fallback;
    }

    @Nullable
    private static BsonDocument getDocument(@Nonnull BsonDocument document, @Nonnull String key) {
        BsonValue value = document.get(key);
        return value != null && value.isDocument() ? value.asDocument() : null;
    }

    @Nullable
    private static String stringValue(@Nonnull BsonDocument document, @Nonnull String key) {
        BsonValue value = document.get(key);
        return value != null && value.isString() ? value.asString().getValue() : null;
    }

    @Nonnull
    private static BsonArray toStringArray(@Nonnull List<String> values) {
        BsonArray array = new BsonArray();
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                array.add(new BsonString(value));
            }
        }
        return array;
    }
}
