package kokeria.hytaledevtoolscompanion.assets.schema;

import java.util.Arrays;
import java.util.Comparator;
import java.util.Map;
import java.util.TreeMap;

import javax.annotation.Nonnull;

import org.bson.BsonDocument;

import com.hypixel.hytale.assetstore.AssetRegistry;
import com.hypixel.hytale.assetstore.AssetStore;
import com.hypixel.hytale.codec.EmptyExtraInfo;
import com.hypixel.hytale.codec.schema.config.Schema;
import com.hypixel.hytale.server.core.schema.SchemaGenerator;

public final class SchemaExportService {
    private SchemaExportService() {
    }

    @Nonnull
    public static SchemaExportData generate() {
        Map<String, Schema> schemas = SchemaGenerator.generateAssetSchemas();

        AssetStore<?, ?, ?>[] stores = AssetRegistry.getStoreMap().values().toArray(AssetStore[]::new);
        Arrays.sort(stores, Comparator.comparing(store -> store.getAssetClass().getSimpleName()));

        Map<String, BsonDocument> schemaDocuments = new TreeMap<>();
        for (Map.Entry<String, Schema> entry : schemas.entrySet()) {
            schemaDocuments.put(entry.getKey(),
                    Schema.CODEC.encode(entry.getValue(), EmptyExtraInfo.EMPTY).asDocument());
        }

        return new SchemaExportData(schemaDocuments, stores);
    }

    public record SchemaExportData(
            @Nonnull Map<String, BsonDocument> schemaDocuments,
            @Nonnull AssetStore<?, ?, ?>[] stores) {
    }
}
