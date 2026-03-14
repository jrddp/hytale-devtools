package kokeria.hytaledevtoolscompanion.assets;

import java.nio.file.Path;
import java.util.List;
import java.util.logging.Level;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

import com.hypixel.hytale.server.core.plugin.JavaPlugin;

import kokeria.hytaledevtoolscompanion.HytaleDevtoolsCompanion;
import kokeria.hytaledevtoolscompanion.assets.index.IndexExportCoordinator;
import kokeria.hytaledevtoolscompanion.assets.index.IndexShard;
import kokeria.hytaledevtoolscompanion.assets.schema.SchemaExportService;
import kokeria.hytaledevtoolscompanion.assets.schema.SchemaMetadataAugmenter;

public final class CompanionDataExportService {
    private CompanionDataExportService() {
    }

    public static void exportSnapshot(@Nonnull JavaPlugin plugin) {
        exportSnapshot(plugin, null);
    }

    public static void exportSnapshot(@Nonnull JavaPlugin plugin, @Nullable Path outputDirectoryOverride) {
        Path outputDirectory = resolveOutputDirectory(plugin, outputDirectoryOverride);
        String hytaleVersion = ExportManifestService.resolveHytaleServerVersion();
        List<ExportManifestService.RuntimePackage> runtimePackages = ExportManifestService.collectRuntimePackages();
        ExportManifestService.ExportManifestSnapshot existingManifest = ExportManifestService
                .readExistingExportManifest(outputDirectory);
        int exportFormatVersion = ExportManifestService.resolveExportFormatVersion(
                HytaleDevtoolsCompanion.EXPORT_FORMAT_VERSION,
                existingManifest);
        ExportManifestService.ExportManifestSnapshot manifestSnapshot = ExportManifestService.createSnapshot(
                hytaleVersion,
                exportFormatVersion,
                runtimePackages);

        if (ExportManifestService.shouldSkipExport(
                plugin,
                outputDirectory,
                manifestSnapshot,
                existingManifest)) {
            return;
        }

        try {
            SchemaExportService.SchemaExportData schemaExportData = SchemaExportService.generate();
            SchemaMetadataAugmenter.augment(schemaExportData.schemaDocuments());

            List<IndexShard> indexShards = IndexExportCoordinator.build(schemaExportData,
                    runtimePackages);

            ExportArtifactsWriter.write(outputDirectory, schemaExportData, indexShards, manifestSnapshot);
            plugin.getLogger().at(Level.INFO).log("Exported companion snapshot artifacts to %s", outputDirectory);
        } catch (Throwable throwable) {
            plugin.getLogger().at(Level.SEVERE).withCause(throwable).log("Failed to export companion snapshot");
        }
    }

    @Nonnull
    private static Path resolveOutputDirectory(@Nonnull JavaPlugin plugin, @Nullable Path outputDirectoryOverride) {
        if (outputDirectoryOverride != null) {
            return outputDirectoryOverride.toAbsolutePath().normalize();
        }
        return plugin.getDataDirectory().toAbsolutePath().normalize();
    }
}
