package kokeria.hytaledevtoolscompanion;

import java.nio.file.Path;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

import com.hypixel.hytale.server.core.event.events.BootEvent;
import com.hypixel.hytale.server.core.plugin.JavaPlugin;
import com.hypixel.hytale.server.core.plugin.JavaPluginInit;
import com.hypixel.hytale.server.core.util.Config;

import kokeria.hytaledevtoolscompanion.assets.AssetRegistryExportService;
import kokeria.hytaledevtoolscompanion.config.HytaleDevtoolsCompanionConfig;

public class HytaleDevtoolsCompanion extends JavaPlugin {
    private final Config<HytaleDevtoolsCompanionConfig> config;

    public HytaleDevtoolsCompanion(@Nonnull JavaPluginInit init) {
        super(init);
        this.config = this.withConfig(HytaleDevtoolsCompanionConfig.CODEC);
    }

    public HytaleDevtoolsCompanionConfig getConfigData() {
        return this.config.get();
    }

    @Override
    protected void setup() {
        this.getEventRegistry().registerGlobal(BootEvent.class, event -> {
            Path exportPath = resolveExportPath(this.getConfigData().getExportPath());
            AssetRegistryExportService.exportSnapshot(this, exportPath);
        });
    }

    @Nullable
    private static Path resolveExportPath(@Nullable String configuredExportPath) {
        if (configuredExportPath == null || configuredExportPath.isBlank()) {
            return null;
        }
        return Path.of(configuredExportPath).toAbsolutePath().normalize();
    }
}
