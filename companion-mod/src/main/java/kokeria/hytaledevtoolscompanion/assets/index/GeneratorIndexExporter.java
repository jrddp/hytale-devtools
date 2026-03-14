package kokeria.hytaledevtoolscompanion.assets.index;

import java.lang.reflect.Array;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.IdentityHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.Comparator;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

import org.bson.BsonDocument;

import com.hypixel.hytale.assetstore.AssetStore;

final class GeneratorIndexExporter {
    private static final String HYTALE_GENERATOR_ASSETS_PACKAGE_PREFIX = "com.hypixel.hytale.builtin.hytalegenerator.assets.";

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

    private GeneratorIndexExporter() {
    }

    @Nonnull
    static List<IndexShard> buildExportFamilies(@Nonnull AssetStore<?, ?, ?>[] stores) {
        Map<String, List<ValueRecord>> recordsByFamily = new TreeMap<>();
        for (AssetStore<?, ?, ?> store : stores) {
            for (Map.Entry<?, ?> entry : store.getAssetMap().getAssetMap().entrySet()) {
                collectExportRecords(
                        entry.getValue(),
                        fileForKey(store, entry.getKey()),
                        IndexExportUtils.getPackageForKey(store, entry.getKey()),
                        recordsByFamily);
            }
        }

        List<IndexShard> shards = new ArrayList<>();
        for (Map.Entry<String, List<ValueRecord>> entry : recordsByFamily.entrySet()) {
            BsonDocument values = new BsonDocument();
            entry.getValue().sort(Comparator.comparing(ValueRecord::name)
                    .thenComparing(value -> Objects.requireNonNullElse(value.file(), ""))
                    .thenComparing(value -> Objects.requireNonNullElse(value.packageName(), "")));

            for (ValueRecord record : entry.getValue()) {
                if (record.name().isBlank() || values.containsKey(record.name())) {
                    continue;
                }
                BsonDocument details = new BsonDocument();
                details.put("sourcedFromFile", IndexExportUtils.nullableString(record.file()));
                details.put("package", IndexExportUtils.nullableString(record.packageName()));
                values.put(record.name(), details);
            }

            shards.add(new IndexShard(
                    "exportFamily",
                    IndexExportUtils.sanitizeIndexKey(entry.getKey()) + ".json",
                    "exportFamily",
                    entry.getKey(),
                    values,
                    null,
                    null));
        }
        return shards;
    }

    @Nonnull
    static List<IndexShard> buildReferenceBundles(@Nonnull AssetStore<?, ?, ?>[] stores) {
        Set<String> decimalConstants = new LinkedHashSet<>();
        for (AssetStore<?, ?, ?> store : stores) {
            if (!"WorldStructureAsset".equals(store.getAssetClass().getSimpleName())) {
                continue;
            }

            for (Object asset : store.getAssetMap().getAssetMap().values()) {
                extractFrameworkDecimalConstants(decimalConstants, asset);
                extractLegacyContentFieldConstants(decimalConstants, asset);
            }
            break;
        }

        if (decimalConstants.isEmpty()) {
            return List.of();
        }

        return List.of(new IndexShard(
                "referenceBundle",
                "DecimalConstants.json",
                "referenceBundle",
                "DecimalConstants",
                IndexExportUtils.toStringArray(decimalConstants.stream().toList()),
                null,
                null));
    }

    private static void collectExportRecords(
            @Nullable Object root,
            @Nullable String file,
            @Nullable String packageName,
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
                for (Map.Entry<?, ?> mapEntry : map.entrySet()) {
                    if (mapEntry.getKey() != null) {
                        stack.push(mapEntry.getKey());
                    }
                    if (mapEntry.getValue() != null) {
                        stack.push(mapEntry.getValue());
                    }
                }
                continue;
            }

            String family = exportFamilyForType(current.getClass());
            if (family != null) {
                String exportName = IndexExportUtils.readStringField(current, "exportName");
                if (exportName != null && !exportName.isBlank()) {
                    recordsByFamily.computeIfAbsent(family, ignored -> new ArrayList<>())
                            .add(new ValueRecord(exportName, file, packageName));
                }
            }

            if (!isHytaleGeneratorAssetType(current.getClass())) {
                continue;
            }

            for (Class<?> type = current.getClass(); type != null && type != Object.class; type = type.getSuperclass()) {
                for (Field field : type.getDeclaredFields()) {
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
            if (isClassOrSuperclassNamed(type, rule.baseClassName())) {
                return rule.family();
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

    private static void extractFrameworkDecimalConstants(@Nonnull Set<String> names, @Nullable Object worldAsset) {
        Object frameworks = IndexExportUtils.readReflectiveField(worldAsset, "frameworkAssets");
        if (frameworks == null || !frameworks.getClass().isArray()) {
            return;
        }

        for (int i = 0; i < Array.getLength(frameworks); i++) {
            Object framework = Array.get(frameworks, i);
            if (framework == null || !framework.getClass().getSimpleName().contains("DecimalConstantsFrameworkAsset")) {
                continue;
            }

            Object entries = IndexExportUtils.readReflectiveField(framework, "entryAssets");
            if (entries == null || !entries.getClass().isArray()) {
                continue;
            }

            for (int entryIndex = 0; entryIndex < Array.getLength(entries); entryIndex++) {
                String name = IndexExportUtils.readStringField(Array.get(entries, entryIndex), "name");
                if (name != null && !name.isBlank()) {
                    names.add(name);
                }
            }
        }
    }

    private static void extractLegacyContentFieldConstants(@Nonnull Set<String> names, @Nullable Object worldAsset) {
        Object contentFields = IndexExportUtils.readReflectiveField(worldAsset, "contentFieldAssets");
        if (contentFields == null || !contentFields.getClass().isArray()) {
            return;
        }

        for (int i = 0; i < Array.getLength(contentFields); i++) {
            Object contentField = Array.get(contentFields, i);
            if (contentField == null
                    || !contentField.getClass().getSimpleName().contains("BaseHeightContentFieldAsset")) {
                continue;
            }

            String name = IndexExportUtils.readStringField(contentField, "name");
            if (name != null && !name.isBlank()) {
                names.add(name);
            }
        }
    }

    @Nullable
    private static String fileForKey(@Nonnull AssetStore<?, ?, ?> store, @Nullable Object key) {
        Path filePath = IndexExportUtils.getPathForKey(store, key);
        return filePath == null ? null : filePath.toString();
    }

    record ValueRecord(@Nonnull String name, @Nullable String file, @Nullable String packageName) {
    }

    record ExportFamilyRule(@Nonnull String family, @Nonnull String baseClassName) {
    }
}
