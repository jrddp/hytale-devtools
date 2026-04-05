import * as assert from "assert";
import { AssetPathMatcher } from "../schema/assetPathMatcher";
import { type AssetDefinition } from "../shared/fieldTypes";

suite("Asset Path Matcher Test Suite", () => {
  test("matches zip paths and filesystem paths", () => {
    const matcher = new AssetPathMatcher([
      createAssetDefinition("Sound Event", "Audio/SoundEvents", ".json"),
      createAssetDefinition("ParticleSpawner", "Particles", ".particlespawner"),
      createAssetDefinition("ParticleSystem", "Particles", ".particlesystem"),
    ]);

    assert.strictEqual(
      matcher.getAssetDefinition("Server/Audio/SoundEvents/Foley/step_stone.json")?.title,
      "Sound Event",
    );
    assert.strictEqual(
      matcher.getAssetDefinition("/tmp/mod/Server/Particles/fire_burst.particlesystem")?.title,
      "ParticleSystem",
    );
    assert.strictEqual(
      matcher.getAssetDefinition("/tmp/mod/Server/Particles/fire_burst.particlespawner")?.title,
      "ParticleSpawner",
    );
    assert.strictEqual(
      matcher.getAssetDefinition("C:\\tmp\\mod\\Server\\Particles\\fire_burst.particlesystem")?.title,
      "ParticleSystem",
    );
  });

  test("returns undefined for unsupported paths", () => {
    const matcher = new AssetPathMatcher([
      createAssetDefinition("Sound Event", "Audio/SoundEvents", ".json"),
    ]);

    assert.strictEqual(
      matcher.getAssetDefinition("/tmp/mod/Client/Audio/SoundEvents/test.json"),
      undefined,
    );
    assert.strictEqual(
      matcher.getAssetDefinition("/tmp/mod/Server/Audio/SoundSets/test.json"),
      undefined,
    );
    assert.strictEqual(
      matcher.getAssetDefinition("/tmp/mod/Server/Audio/SoundEvents/test.asset"),
      undefined,
    );
  });

  test("rejects overlapping schema paths", () => {
    assert.throws(
      () =>
        new AssetPathMatcher([
          createAssetDefinition("NPC", "NPC", ".json"),
          createAssetDefinition("Trait", "NPC/Traits", ".json"),
        ]),
      /Overlapping asset schema path detected/,
    );
  });
});

function createAssetDefinition(
  title: string,
  assetPath: string,
  extension: string,
): AssetDefinition {
  return {
    title,
    rootField: {} as AssetDefinition["rootField"],
    buttons: [],
    refDependencies: new Set<string>(),
    path: assetPath,
    extension,
  };
}
