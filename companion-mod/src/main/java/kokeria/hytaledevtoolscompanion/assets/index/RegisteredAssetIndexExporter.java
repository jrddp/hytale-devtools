package kokeria.hytaledevtoolscompanion.assets.index;

import java.io.IOException;
import java.nio.file.FileVisitOption;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.stream.Stream;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

import org.bson.BsonDocument;

import com.hypixel.hytale.assetstore.AssetStore;
import com.hypixel.hytale.builtin.asseteditor.AssetEditorPlugin;
import com.hypixel.hytale.builtin.asseteditor.assettypehandler.AssetStoreTypeHandler;
import com.hypixel.hytale.builtin.asseteditor.assettypehandler.AssetTypeHandler;

import kokeria.hytaledevtoolscompanion.assets.ExportManifestService;

final class RegisteredAssetIndexExporter {
    private RegisteredAssetIndexExporter() {
    }

    @Nonnull
    static List<IndexShard> build(
            @Nonnull AssetStore<?, ?, ?>[] stores,
            @Nonnull List<ExportManifestService.RuntimePackage> runtimePackages) {
        Map<String, RegisteredAssetTypeData> byType = new TreeMap<>();
        collectStoreBackedRegisteredAssets(byType, stores);
        collectHandlerBackedRegisteredAssets(byType, runtimePackages);

        List<IndexShard> shards = new ArrayList<>();
        for (Map.Entry<String, RegisteredAssetTypeData> entry : byType.entrySet()) {
            BsonDocument values = new BsonDocument();
            entry.getValue().entries().sort(Comparator.comparing(RegisteredAssetEntry::name)
                    .thenComparing(value -> Objects.requireNonNullElse(value.sourcedFromFile(), "")));

            for (RegisteredAssetEntry asset : entry.getValue().entries()) {
                if (asset.name().isBlank() || values.containsKey(asset.name())) {
                    continue;
                }

                BsonDocument details = new BsonDocument();
                details.put("sourcedFromFile", IndexExportUtils.nullableString(asset.sourcedFromFile()));
                details.put("package", IndexExportUtils.nullableString(asset.packageName()));
                values.put(asset.name(), details);
            }

            shards.add(new IndexShard(
                    "registeredAssets",
                    IndexExportUtils.sanitizeIndexKey(entry.getKey()) + ".json",
                    "registeredAssets",
                    entry.getKey(),
                    values,
                    entry.getValue().path(),
                    entry.getValue().extension()));
        }
        return shards;
    }

    private static void collectStoreBackedRegisteredAssets(
            @Nonnull Map<String, RegisteredAssetTypeData> byType,
            @Nonnull AssetStore<?, ?, ?>[] stores) {
        for (AssetStore<?, ?, ?> store : stores) {
            String type = store.getAssetClass().getSimpleName();
            RegisteredAssetTypeData typeData = byType.computeIfAbsent(type,
                    ignored -> new RegisteredAssetTypeData(
                            IndexExportUtils.resolveAssetStoreTypePath(store),
                            IndexExportUtils.normalizeAssetTypeExtension(store.getExtension())));
            typeData.path = typeData.path == null ? IndexExportUtils.resolveAssetStoreTypePath(store) : typeData.path;
            typeData.extension = typeData.extension == null
                    ? IndexExportUtils.normalizeAssetTypeExtension(store.getExtension())
                    : typeData.extension;

            List<Object> keys = new ArrayList<>(store.getAssetMap().getAssetMap().keySet());
            keys.sort(Comparator.comparing(IndexExportUtils::stringOrEmpty));
            for (Object key : keys) {
                String name = IndexExportUtils.stringOrNull(key);
                if (name == null || name.isBlank()) {
                    continue;
                }

                Path filePath = IndexExportUtils.getPathForKey(store, key);
                typeData.entries().add(new RegisteredAssetEntry(
                        name,
                        filePath == null ? null : filePath.toString(),
                        IndexExportUtils.getPackageForKey(store, key)));
            }
        }
    }

    private static void collectHandlerBackedRegisteredAssets(
            @Nonnull Map<String, RegisteredAssetTypeData> byType,
            @Nonnull List<ExportManifestService.RuntimePackage> runtimePackages) {
        AssetEditorPlugin assetEditorPlugin = AssetEditorPlugin.get();
        if (assetEditorPlugin == null) {
            return;
        }

        List<AssetTypeHandler> handlers = new ArrayList<>(
                assetEditorPlugin.getAssetTypeRegistry().getRegisteredAssetTypeHandlers().values());
        handlers.sort(Comparator.comparing(handler -> handler.getConfig().id == null ? "" : handler.getConfig().id));

        for (AssetTypeHandler handler : handlers) {
            if (handler instanceof AssetStoreTypeHandler) {
                continue;
            }

            String type = handler.getConfig().id;
            if (type == null || type.isBlank()) {
                continue;
            }

            String path = IndexExportUtils.normalizeAssetTypePath(handler.getConfig().path);
            if (path == null) {
                path = IndexExportUtils.normalizeAssetTypePath(handler.getRootPath().toString());
            }

            String extension = IndexExportUtils.normalizeAssetTypeExtension(handler.getConfig().fileExtension);
            RegisteredAssetTypeData typeData = byType.get(type);
            if (typeData == null) {
                typeData = new RegisteredAssetTypeData(path, extension);
                byType.put(type, typeData);
            }
            typeData.path = typeData.path == null ? path : typeData.path;
            typeData.extension = typeData.extension == null ? extension : typeData.extension;
            RegisteredAssetTypeData targetTypeData = typeData;

            if (path == null || extension == null) {
                continue;
            }

            for (ExportManifestService.RuntimePackage runtimePackage : runtimePackages) {
                Path assetRoot = runtimePackage.root().resolve(path).normalize();
                if (!Files.isDirectory(assetRoot)) {
                    continue;
                }

                try (Stream<Path> stream = Files.walk(assetRoot, Integer.MAX_VALUE, FileVisitOption.FOLLOW_LINKS)) {
                    stream.filter(Files::isRegularFile)
                            .filter(file -> file.getFileName().toString().toLowerCase(Locale.ROOT)
                                    .endsWith(extension.toLowerCase(Locale.ROOT)))
                            .sorted()
                            .forEach(file -> {
                                String relativeName = IndexExportUtils.trimSuffixIgnoreCase(
                                        IndexExportUtils.toUnixPathString(assetRoot.relativize(file)),
                                        extension);
                                if (relativeName.isBlank()) {
                                    return;
                                }

                                String sourcedFromFile = IndexExportUtils
                                        .toUnixPathString(runtimePackage.root().relativize(file));
                                targetTypeData.entries().add(new RegisteredAssetEntry(
                                        relativeName,
                                        sourcedFromFile,
                                        runtimePackage.name()));
                            });
                } catch (IOException ignored) {
                    // best-effort collection
                }
            }
        }
    }

    static final class RegisteredAssetTypeData {
        private String path;
        private String extension;
        private final List<RegisteredAssetEntry> entries = new ArrayList<>();

        private RegisteredAssetTypeData(@Nullable String path, @Nullable String extension) {
            this.path = path;
            this.extension = extension;
        }

        @Nullable
        String path() {
            return this.path;
        }

        @Nullable
        String extension() {
            return this.extension;
        }

        @Nonnull
        List<RegisteredAssetEntry> entries() {
            return this.entries;
        }
    }

    record RegisteredAssetEntry(@Nonnull String name, @Nullable String sourcedFromFile, @Nullable String packageName) {
    }
}
