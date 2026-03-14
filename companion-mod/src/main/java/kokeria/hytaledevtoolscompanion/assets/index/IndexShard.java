package kokeria.hytaledevtoolscompanion.assets.index;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

import org.bson.BsonDocument;
import org.bson.BsonInt32;
import org.bson.BsonString;
import org.bson.BsonValue;

public record IndexShard(
        @Nonnull String directory,
        @Nonnull String fileName,
        @Nonnull String indexKind,
        @Nonnull String key,
        @Nonnull BsonValue values,
        @Nullable String path,
        @Nullable String extension) {
    @Nonnull
    public String relativePath() {
        return "indexes/" + this.directory + "/" + this.fileName;
    }

    @Nonnull
    public BsonDocument toBsonDocument(@Nonnull String hytaleVersion, @Nonnull String generatedAt) {
        BsonDocument document = new BsonDocument();
        document.put("hytaleVersion", new BsonString(hytaleVersion));
        document.put("generatedAt", new BsonString(generatedAt));
        document.put("indexKind", new BsonString(this.indexKind));
        document.put("key", new BsonString(this.key));
        if ("registeredAssets".equals(this.indexKind)) {
            document.put("path", IndexExportUtils.nullableString(this.path));
            document.put("extension", IndexExportUtils.nullableString(this.extension));
            document.put("assetCount", new BsonInt32(this.values.isDocument() ? this.values.asDocument().size() : 0));
            document.put("fileCount", new BsonInt32(countFileBackedAssets(this.values)));
        }
        document.put("values", this.values);
        return document;
    }

    private static int countFileBackedAssets(@Nonnull BsonValue values) {
        if (!values.isDocument()) {
            return 0;
        }

        int count = 0;
        for (BsonValue value : values.asDocument().values()) {
            if (!value.isDocument()) {
                continue;
            }
            BsonValue sourcedFromFile = value.asDocument().get("sourcedFromFile");
            if (sourcedFromFile != null && sourcedFromFile.isString()
                    && !sourcedFromFile.asString().getValue().isBlank()) {
                count++;
            }
        }
        return count;
    }
}
