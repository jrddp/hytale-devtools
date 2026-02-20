package kokeria.hytaledevtoolscompanion.config;

import com.hypixel.hytale.codec.Codec;
import com.hypixel.hytale.codec.KeyedCodec;
import com.hypixel.hytale.codec.builder.BuilderCodec;

public class HytaleDevtoolsCompanionConfig {
    public static final BuilderCodec<HytaleDevtoolsCompanionConfig> CODEC = BuilderCodec
            .builder(HytaleDevtoolsCompanionConfig.class, HytaleDevtoolsCompanionConfig::new)
            .append(
                    new KeyedCodec<>("ExportPath", Codec.STRING),
                    (config, value, info) -> config.exportPath = value,
                    (config, info) -> config.exportPath)
            .documentation("Absolute path to export generated files to. Empty uses the plugin data directory.")
            .add()
            .build();

    private String exportPath = "";

    public HytaleDevtoolsCompanionConfig() {
    }

    public String getExportPath() {
        return exportPath;
    }
}
