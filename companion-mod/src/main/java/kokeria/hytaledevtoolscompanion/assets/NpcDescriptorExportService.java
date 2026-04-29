package kokeria.hytaledevtoolscompanion.assets;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.logging.Level;

import javax.annotation.Nonnull;

import com.hypixel.hytale.server.core.plugin.JavaPlugin;
import com.hypixel.hytale.server.npc.NPCPlugin;
import com.hypixel.hytale.server.npc.asset.builder.BuilderDescriptor;
import com.hypixel.hytale.server.npc.asset.builder.BuilderManager;

final class NpcDescriptorExportService {
    private static final String NPC_DESCRIPTOR_FILE_NAME = "npc_descriptors.json";

    private NpcDescriptorExportService() {
    }

    static void write(@Nonnull JavaPlugin plugin, @Nonnull Path outputDirectory) throws IOException {
        Files.createDirectories(outputDirectory);

        Path outputPath = outputDirectory.resolve(NPC_DESCRIPTOR_FILE_NAME);
        NPCPlugin npcPlugin = NPCPlugin.get();
        if (npcPlugin == null) {
            Files.deleteIfExists(outputPath);
            plugin.getLogger().at(Level.WARNING).log("NPCPlugin was not available; skipping NPC descriptor export.");
            return;
        }

        List<BuilderDescriptor> descriptors = npcPlugin.getBuilderManager().generateDescriptors();
        BuilderManager.saveDescriptors(descriptors, outputPath);
        plugin.getLogger().at(Level.INFO).log("Exported NPC descriptors to %s", outputPath);
    }
}
