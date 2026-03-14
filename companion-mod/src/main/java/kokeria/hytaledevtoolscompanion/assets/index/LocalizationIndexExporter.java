package kokeria.hytaledevtoolscompanion.assets.index;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitOption;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

import org.bson.BsonDocument;

import com.hypixel.hytale.builtin.asseteditor.AssetEditorPlugin;
import com.hypixel.hytale.builtin.asseteditor.assettypehandler.AssetStoreTypeHandler;
import com.hypixel.hytale.builtin.asseteditor.assettypehandler.AssetTypeHandler;

import kokeria.hytaledevtoolscompanion.assets.ExportManifestService;

final class LocalizationIndexExporter {
    private LocalizationIndexExporter() {
    }

    @Nonnull
    static List<IndexShard> build(
            @Nonnull List<ExportManifestService.RuntimePackage> runtimePackages) {
        Set<Path> languageFiles = new TreeSet<>();
        for (ExportManifestService.RuntimePackage runtimePackage : runtimePackages) {
            collectLanguageFiles(languageFiles, runtimePackage.root().resolve("Server").resolve("Languages"));
            collectLanguageFiles(languageFiles, runtimePackage.root().resolve("Common").resolve("Languages"));
        }
        collectLanguageFilesFromAssetTypeHandlers(languageFiles);

        Map<String, List<LocalizationRecord>> recordsByLocale = new TreeMap<>();
        for (Path languageFile : languageFiles) {
            parseLangFile(languageFile, recordsByLocale);
        }

        List<IndexShard> shards = new ArrayList<>();
        for (Map.Entry<String, List<LocalizationRecord>> entry : recordsByLocale.entrySet()) {
            BsonDocument values = new BsonDocument();
            entry.getValue().sort(Comparator.comparing(LocalizationRecord::key)
                    .thenComparing(value -> Objects.requireNonNullElse(value.file(), "")));

            for (LocalizationRecord record : entry.getValue()) {
                if (record.key().isBlank() || values.containsKey(record.key())) {
                    continue;
                }
                values.put(record.key(), IndexExportUtils.nullableString(record.translation()));
            }

            shards.add(new IndexShard(
                    "localization",
                    IndexExportUtils.sanitizeIndexKey(entry.getKey()) + ".json",
                    "localizationKeys",
                    entry.getKey(),
                    values,
                    null,
                    null));
        }
        return shards;
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

            String typeId = handler.getConfig().id;
            if (typeId == null || !"Language".equalsIgnoreCase(typeId)) {
                continue;
            }

            Path root = handler.getRootPath();
            collectLanguageFiles(output, root.isAbsolute() ? root : root.toAbsolutePath().normalize());
        }
    }

    private static void parseLangFile(
            @Nonnull Path file,
            @Nonnull Map<String, List<LocalizationRecord>> recordsByLocale) {
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

        StringBuilder pending = new StringBuilder();
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            if (i == 0 && !line.isEmpty() && line.charAt(0) == '\uFEFF') {
                line = line.substring(1);
            }

            pending.append(line);
            if (pending.length() > 0 && pending.charAt(pending.length() - 1) == '\\') {
                pending.setLength(pending.length() - 1);
                continue;
            }

            String complete = pending.toString();
            pending.setLength(0);

            String trimmed = complete.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }

            int equalsIndex = complete.indexOf('=');
            if (equalsIndex <= 0) {
                continue;
            }

            String localKey = complete.substring(0, equalsIndex).trim();
            if (localKey.isEmpty()) {
                continue;
            }

            String translation = complete.substring(equalsIndex + 1).trim();
            String fullKey = pathInfo.prefix().isBlank() ? localKey : pathInfo.prefix() + "." + localKey;
            recordsByLocale.computeIfAbsent(pathInfo.locale(), ignored -> new ArrayList<>())
                    .add(new LocalizationRecord(fullKey, translation, file.toString()));
        }
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

        int contentStart = languagesIndex + 1;
        String locale = segments.get(contentStart);
        if (locale.toLowerCase(Locale.ROOT).endsWith(".lang")) {
            locale = "fallback";
        } else {
            contentStart++;
        }

        if (contentStart >= segments.size()) {
            return null;
        }

        List<String> contentSegments = new ArrayList<>(segments.subList(contentStart, segments.size()));
        String fileName = contentSegments.remove(contentSegments.size() - 1);
        int dot = fileName.lastIndexOf('.');
        String stem = dot >= 0 ? fileName.substring(0, dot) : fileName;
        if (!stem.isBlank()) {
            contentSegments.add(stem);
        }

        return new LangPathInfo(locale, contentSegments.stream()
                .filter(segment -> !segment.isBlank())
                .collect(Collectors.joining(".")));
    }

    record LocalizationRecord(@Nonnull String key, @Nullable String translation, @Nullable String file) {
    }

    record LangPathInfo(@Nonnull String locale, @Nonnull String prefix) {
    }
}
