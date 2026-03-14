package kokeria.hytaledevtoolscompanion.assets.index;

import java.lang.reflect.Field;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

import org.bson.BsonArray;
import org.bson.BsonNull;
import org.bson.BsonString;
import org.bson.BsonValue;

import com.hypixel.hytale.assetstore.AssetMap;
import com.hypixel.hytale.assetstore.AssetStore;

final class IndexExportUtils {
    private IndexExportUtils() {
    }

    @Nullable
    static String resolveAssetStoreTypePath(@Nonnull AssetStore<?, ?, ?> store) {
        String path = normalizeAssetTypePath(store.getPath());
        if (path == null) {
            return null;
        }
        return path.startsWith("Server/") || path.startsWith("Common/") ? path : "Server/" + path;
    }

    @Nullable
    static String normalizeAssetTypePath(@Nullable String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim().replace('\\', '/');
        while (normalized.startsWith("./")) {
            normalized = normalized.substring(2);
        }
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized.isBlank() ? null : normalized;
    }

    @Nullable
    static String normalizeAssetTypeExtension(@Nullable String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        if (normalized.isBlank()) {
            return null;
        }
        return normalized.startsWith(".") ? normalized : "." + normalized;
    }

    @Nonnull
    static String resolveFileType(@Nonnull String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot <= 0 || dot == fileName.length() - 1 ? "no_extension"
                : fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    @Nonnull
    static String sanitizeIndexKey(@Nonnull String key) {
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

    @SuppressWarnings({ "rawtypes", "unchecked" })
    @Nullable
    static String getPackageForKey(@Nonnull AssetStore<?, ?, ?> store, @Nullable Object key) {
        if (key == null) {
            return null;
        }

        try {
            return ((AssetMap) store.getAssetMap()).getAssetPack(key);
        } catch (Throwable ignored) {
            return null;
        }
    }

    @SuppressWarnings({ "rawtypes", "unchecked" })
    @Nullable
    static Path getPathForKey(@Nonnull AssetStore<?, ?, ?> store, @Nullable Object key) {
        if (key == null) {
            return null;
        }

        try {
            return ((AssetMap) store.getAssetMap()).getPath(key);
        } catch (Throwable ignored) {
            return null;
        }
    }

    @Nonnull
    static String toUnixPathString(@Nonnull Path path) {
        return path.toString().replace('\\', '/');
    }

    @Nonnull
    static String trimSuffixIgnoreCase(@Nonnull String value, @Nonnull String suffix) {
        if (value.length() < suffix.length()) {
            return value;
        }

        int suffixStart = value.length() - suffix.length();
        return value.regionMatches(true, suffixStart, suffix, 0, suffix.length()) ? value.substring(0, suffixStart)
                : value;
    }

    @Nullable
    static String stringOrNull(@Nullable Object value) {
        return value == null ? null : value.toString();
    }

    @Nonnull
    static String stringOrEmpty(@Nullable Object value) {
        return value == null ? "" : value.toString();
    }

    @Nullable
    static Object readReflectiveField(@Nullable Object target, @Nonnull String fieldName) {
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
    static String readStringField(@Nullable Object target, @Nonnull String fieldName) {
        Object value = readReflectiveField(target, fieldName);
        return value == null ? null : value.toString();
    }

    @Nonnull
    static BsonArray toStringArray(@Nonnull List<String> values) {
        BsonArray array = new BsonArray();
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                array.add(new BsonString(value));
            }
        }
        return array;
    }

    @Nonnull
    static BsonValue nullableString(@Nullable String value) {
        return value == null ? BsonNull.VALUE : new BsonString(value);
    }
}
