package kokeria.hytaledevtoolscompanion.assets;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import javax.annotation.Nonnull;

import org.bson.BsonDocument;

import com.hypixel.hytale.server.core.util.BsonUtil;

import kokeria.hytaledevtoolscompanion.assets.index.IndexShard;
import kokeria.hytaledevtoolscompanion.assets.schema.SchemaExportService;

final class ExportArtifactsWriter {
    private static final String SCHEMAS_DIRECTORY = "schemas";
    private static final String INDEXES_DIRECTORY = "indexes";

    private static final List<String> LEGACY_EXPORT_FILES = List.of(
            "stores_info",
            "codecs_info",
            "asset_key_domains",
            "material_solid_values",
            "material_fluid_values",
            "schemas",
            "asset_types_info",
            "property_semantics");

    private ExportArtifactsWriter() {
    }

    static void write(
            @Nonnull Path outputDirectory,
            @Nonnull SchemaExportService.SchemaExportData schemaExportData,
            @Nonnull List<IndexShard> indexShards,
            @Nonnull ExportManifestService.ExportManifestSnapshot manifestSnapshot) throws IOException {
        Files.createDirectories(outputDirectory);

        String generatedAt = Instant.now().toString();
        writeSchemas(outputDirectory, schemaExportData.schemaDocuments());
        writeIndexes(outputDirectory, indexShards, manifestSnapshot.hytaleVersion(), generatedAt);
        ExportManifestService.write(outputDirectory, manifestSnapshot, generatedAt);
        cleanupLegacyArtifacts(outputDirectory);
    }

    private static void writeSchemas(
            @Nonnull Path outputDirectory,
            @Nonnull Map<String, BsonDocument> schemaDocuments) throws IOException {
        Path schemaDirectory = outputDirectory.resolve(SCHEMAS_DIRECTORY);
        clearDirectory(schemaDirectory);
        Files.createDirectories(schemaDirectory);

        for (Map.Entry<String, BsonDocument> entry : schemaDocuments.entrySet()) {
            BsonUtil.writeDocument(schemaDirectory.resolve(entry.getKey()), entry.getValue(), false).join();
        }
    }

    private static void writeIndexes(
            @Nonnull Path outputDirectory,
            @Nonnull List<IndexShard> indexShards,
            @Nonnull String hytaleVersion,
            @Nonnull String generatedAt) throws IOException {
        Path indexesDirectory = outputDirectory.resolve(INDEXES_DIRECTORY);
        clearDirectory(indexesDirectory);
        Files.createDirectories(indexesDirectory);

        for (IndexShard indexShard : indexShards) {
            Path outputPath = outputDirectory.resolve(indexShard.relativePath());
            Files.createDirectories(outputPath.getParent());
            BsonUtil.writeDocument(outputPath, indexShard.toBsonDocument(hytaleVersion, generatedAt), false).join();
        }
    }

    private static void cleanupLegacyArtifacts(@Nonnull Path outputDirectory) throws IOException {
        for (String legacyFile : LEGACY_EXPORT_FILES) {
            deleteFilePair(outputDirectory, legacyFile);
        }

        Files.deleteIfExists(outputDirectory.resolve("schemas.bson"));
        deleteFilePair(outputDirectory, "schema_mappings");
        Files.deleteIfExists(outputDirectory.resolve("schemaMappings.bson"));
        Files.deleteIfExists(outputDirectory.resolve("schemaMappings.json"));
        Files.deleteIfExists(outputDirectory.resolve("autocomplete_semantics_v1.json"));
        Files.deleteIfExists(outputDirectory.resolve("reference_indexes_v1.json"));
        Files.deleteIfExists(outputDirectory.resolve("autocomplete_semantics_v1.bson"));
        Files.deleteIfExists(outputDirectory.resolve("reference_indexes_v1.bson"));
        deleteFilePair(outputDirectory, "index_manifest");
    }

    private static void deleteFilePair(@Nonnull Path outputDirectory, @Nonnull String baseFileName) throws IOException {
        Files.deleteIfExists(outputDirectory.resolve(baseFileName + ".json"));
        Files.deleteIfExists(outputDirectory.resolve(baseFileName + ".bson"));
    }

    private static void clearDirectory(@Nonnull Path directory) throws IOException {
        if (!Files.exists(directory)) {
            return;
        }

        try (Stream<Path> stream = Files.walk(directory)) {
            stream.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException exception) {
                    throw new RuntimeException(exception);
                }
            });
        }
    }
}
