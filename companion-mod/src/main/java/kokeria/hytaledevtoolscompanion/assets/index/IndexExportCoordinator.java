package kokeria.hytaledevtoolscompanion.assets.index;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import javax.annotation.Nonnull;

import kokeria.hytaledevtoolscompanion.assets.ExportManifestService;
import kokeria.hytaledevtoolscompanion.assets.schema.SchemaExportService;

public final class IndexExportCoordinator {
    private IndexExportCoordinator() {
    }

    @Nonnull
    public static List<IndexShard> build(
            @Nonnull SchemaExportService.SchemaExportData schemaExportData,
            @Nonnull List<ExportManifestService.RuntimePackage> runtimePackages) {
        List<IndexShard> shards = new ArrayList<>();
        shards.add(CommonAssetPathIndexExporter.build(runtimePackages));
        shards.addAll(RegisteredAssetIndexExporter.build(schemaExportData.stores(), runtimePackages));
        shards.addAll(GeneratorIndexExporter.buildExportFamilies(schemaExportData.stores()));
        shards.addAll(GeneratorIndexExporter.buildReferenceBundles(schemaExportData.stores()));
        shards.addAll(LocalizationIndexExporter.build(runtimePackages));
        shards.addAll(UiDataSetIndexExporter.build(schemaExportData.schemaDocuments(), runtimePackages));
        shards.sort(Comparator.comparing(IndexShard::relativePath));
        return shards;
    }
}
