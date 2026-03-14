package kokeria.hytaledevtoolscompanion.assets.index;

import java.io.IOException;
import java.nio.file.FileVisitOption;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Stream;

import javax.annotation.Nonnull;

import org.bson.BsonArray;
import org.bson.BsonDocument;
import org.bson.BsonString;

import kokeria.hytaledevtoolscompanion.assets.ExportManifestService;

final class CommonAssetPathIndexExporter {
    private CommonAssetPathIndexExporter() {
    }

    @Nonnull
    static IndexShard build(@Nonnull List<ExportManifestService.RuntimePackage> runtimePackages) {
        Map<String, Map<String, Set<String>>> values = new TreeMap<>();
        for (ExportManifestService.RuntimePackage runtimePackage : runtimePackages) {
            Path commonRoot = runtimePackage.root().resolve("Common");
            if (!Files.isDirectory(commonRoot)) {
                continue;
            }

            try (Stream<Path> stream = Files.walk(commonRoot, Integer.MAX_VALUE, FileVisitOption.FOLLOW_LINKS)) {
                stream.filter(Files::isRegularFile).forEach(path -> {
                    String relative = IndexExportUtils.toUnixPathString(commonRoot.relativize(path));
                    int slash = relative.lastIndexOf('/');
                    String folder = slash >= 0 ? relative.substring(0, slash) : ".";
                    String fileName = slash >= 0 ? relative.substring(slash + 1) : relative;
                    if (fileName.isBlank()) {
                        return;
                    }

                    values.computeIfAbsent(folder, ignored -> new TreeMap<>())
                            .computeIfAbsent(IndexExportUtils.resolveFileType(fileName), ignored -> new TreeSet<>())
                            .add(fileName);
                });
            } catch (IOException ignored) {
                // best-effort collection
            }
        }

        BsonDocument documentValues = new BsonDocument();
        for (Map.Entry<String, Map<String, Set<String>>> folderEntry : values.entrySet()) {
            BsonDocument byExtension = new BsonDocument();
            for (Map.Entry<String, Set<String>> extensionEntry : folderEntry.getValue().entrySet()) {
                BsonArray files = new BsonArray();
                for (String file : extensionEntry.getValue()) {
                    files.add(new BsonString(file));
                }
                byExtension.put(extensionEntry.getKey(), files);
            }
            documentValues.put(folderEntry.getKey(), byExtension);
        }

        return new IndexShard("commonAssetPaths", "all.json", "commonAssetPaths", "all", documentValues, null, null);
    }
}
