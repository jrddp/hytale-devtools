package kokeria.hytaledevtoolscompanion.assets;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.logging.Level;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

import org.bson.BsonArray;
import org.bson.BsonDocument;
import org.bson.BsonInt32;
import org.bson.BsonString;
import org.bson.BsonValue;

import com.hypixel.hytale.assetstore.AssetPack;
import com.hypixel.hytale.common.plugin.PluginManifest;
import com.hypixel.hytale.common.util.java.ManifestUtil;
import com.hypixel.hytale.server.core.asset.AssetModule;
import com.hypixel.hytale.server.core.plugin.JavaPlugin;
import com.hypixel.hytale.server.core.util.BsonUtil;

public final class ExportManifestService {
    private static final String EXPORT_MANIFEST_FILE = "export_manifest";

    private ExportManifestService() {
    }

    @Nonnull
    static ExportManifestSnapshot createSnapshot(
            @Nonnull String hytaleVersion,
            int exportFormatVersion,
            @Nonnull List<RuntimePackage> runtimePackages) {
        List<ManifestPackage> loadedPackages = runtimePackages.stream()
                .map(RuntimePackage::manifestPackage)
                .toList();
        return new ExportManifestSnapshot(exportFormatVersion, hytaleVersion, loadedPackages);
    }

    static int resolveExportFormatVersion(
            int configuredExportFormatVersion,
            @Nullable ExportManifestSnapshot existingManifest) {
        return existingManifest != null && existingManifest.exportFormatVersion() == -1
                ? -1
                : configuredExportFormatVersion;
    }

    @Nonnull
    static List<RuntimePackage> collectRuntimePackages() {
        AssetModule assetModule = AssetModule.get();
        if (assetModule == null) {
            return List.of();
        }

        List<RuntimePackage> runtimePackages = new ArrayList<>();
        for (AssetPack assetPack : assetModule.getAssetPacks()) {
            PluginManifest manifest = assetPack.getManifest();
            String version = manifest != null && manifest.getVersion() != null ? manifest.getVersion().toString() : "";
            String packLocation = assetPack.getPackLocation().toAbsolutePath().normalize().toString();
            runtimePackages.add(new RuntimePackage(
                    assetPack.getName(),
                    version,
                    packLocation,
                    assetPack.getRoot().toAbsolutePath().normalize()));
        }

        runtimePackages.sort(Comparator.comparing(RuntimePackage::name)
                .thenComparing(RuntimePackage::version)
                .thenComparing(RuntimePackage::packLocation));
        return runtimePackages;
    }

    static boolean shouldSkipExport(
            @Nonnull JavaPlugin plugin,
            @Nonnull Path outputDirectory,
            @Nonnull ExportManifestSnapshot currentManifest,
            @Nullable ExportManifestSnapshot existingManifest) {
        if (existingManifest == null) {
            return false;
        }

        if (existingManifest.exportFormatVersion() == -1) {
            return false;
        }

        if (!existingManifest.matches(currentManifest)) {
            return false;
        }

        plugin.getLogger().at(Level.INFO).log(
                "Snapshot artifacts already match export manifest at %s (hytaleVersion=%s, exportFormatVersion=%d, loadedPackages=%d); skipping export.",
                outputDirectory,
                currentManifest.hytaleVersion(),
                currentManifest.exportFormatVersion(),
                currentManifest.loadedPackages().size());
        return true;
    }

    @Nullable
    static ExportManifestSnapshot readExistingExportManifest(@Nonnull Path outputDirectory) {
        Path exportManifestPath = outputDirectory.resolve(EXPORT_MANIFEST_FILE + ".json");
        if (!Files.isRegularFile(exportManifestPath)) {
            return null;
        }

        try {
            String rawJson = Files.readString(exportManifestPath, StandardCharsets.UTF_8);
            if (rawJson.isBlank()) {
                return null;
            }
            return ExportManifestSnapshot.fromBson(BsonDocument.parse(rawJson));
        } catch (IOException | RuntimeException ignored) {
            return null;
        }
    }

    static void write(
            @Nonnull Path outputDirectory,
            @Nonnull ExportManifestSnapshot manifestSnapshot,
            @Nonnull String exportedAt) {
        BsonUtil.writeDocument(
                outputDirectory.resolve(EXPORT_MANIFEST_FILE + ".json"),
                manifestSnapshot.toBsonDocument(exportedAt),
                false).join();
    }

    @Nonnull
    static String resolveHytaleServerVersion() {
        try {
            String version = ManifestUtil.getImplementationVersion();
            if (version != null && !version.isBlank()) {
                return version;
            }
        } catch (Throwable ignored) {
            // best-effort metadata only
        }
        return "unknown";
    }

    public record RuntimePackage(
            @Nonnull String name,
            @Nonnull String version,
            @Nonnull String packLocation,
            @Nonnull Path root) {
        @Nonnull
        ManifestPackage manifestPackage() {
            return new ManifestPackage(this.name, this.version, this.packLocation);
        }
    }

    record ManifestPackage(
            @Nonnull String name,
            @Nonnull String version,
            @Nonnull String packLocation) {
        @Nonnull
        BsonDocument toBsonDocument() {
            BsonDocument document = new BsonDocument();
            document.put("name", new BsonString(this.name));
            document.put("version", new BsonString(this.version));
            document.put("packLocation", new BsonString(this.packLocation));
            return document;
        }

        @Nonnull
        static ManifestPackage fromBson(@Nonnull BsonDocument document) {
            return new ManifestPackage(
                    stringValue(document, "name"),
                    stringValue(document, "version"),
                    stringValue(document, "packLocation"));
        }
    }

    record ExportManifestSnapshot(
            int exportFormatVersion,
            @Nonnull String hytaleVersion,
            @Nonnull List<ManifestPackage> loadedPackages) {
        boolean matches(@Nonnull ExportManifestSnapshot other) {
            return this.exportFormatVersion == other.exportFormatVersion
                    && Objects.equals(this.hytaleVersion, other.hytaleVersion)
                    && this.loadedPackages.equals(other.loadedPackages);
        }

        @Nonnull
        BsonDocument toBsonDocument(@Nonnull String exportedAt) {
            BsonArray loadedPackagesArray = new BsonArray();
            for (ManifestPackage loadedPackage : this.loadedPackages) {
                loadedPackagesArray.add(loadedPackage.toBsonDocument());
            }

            BsonDocument document = new BsonDocument();
            document.put("exportFormatVersion", new BsonInt32(this.exportFormatVersion));
            document.put("hytaleVersion", new BsonString(this.hytaleVersion));
            document.put("loadedPackages", loadedPackagesArray);
            document.put("exportedAt", new BsonString(exportedAt));
            return document;
        }

        @Nullable
        static ExportManifestSnapshot fromBson(@Nonnull BsonDocument document) {
            BsonValue exportFormatVersion = document.get("exportFormatVersion");
            BsonValue hytaleVersion = document.get("hytaleVersion");
            BsonValue loadedPackages = document.get("loadedPackages");
            if (exportFormatVersion == null || !exportFormatVersion.isInt32()
                    || hytaleVersion == null || !hytaleVersion.isString()
                    || loadedPackages == null || !loadedPackages.isArray()) {
                return null;
            }

            List<ManifestPackage> packages = new ArrayList<>();
            for (BsonValue value : loadedPackages.asArray()) {
                if (!value.isDocument()) {
                    return null;
                }
                packages.add(ManifestPackage.fromBson(value.asDocument()));
            }

            return new ExportManifestSnapshot(
                    exportFormatVersion.asInt32().getValue(),
                    hytaleVersion.asString().getValue(),
                    packages);
        }
    }

    @Nonnull
    private static String stringValue(@Nonnull BsonDocument document, @Nonnull String key) {
        BsonValue value = document.get(key);
        return value != null && value.isString() ? value.asString().getValue() : "";
    }
}
