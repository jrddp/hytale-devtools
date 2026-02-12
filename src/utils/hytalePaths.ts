import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const DEFAULT_PATCHLINE = 'release';

export function getHytaleHome(): string {
    const home = os.homedir();
    if (process.platform === 'win32') {
        return path.join(home, 'AppData', 'Roaming', 'Hytale');
    }

    if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'Hytale');
    }

    return path.join(home, '.hytale');
}

export function resolvePatchlineFromWorkspace(rootPath: string, defaultPatchline: string = DEFAULT_PATCHLINE): string {
    const gradlePropertiesPath = path.join(rootPath, 'gradle.properties');
    if (!fs.existsSync(gradlePropertiesPath)) {
        return defaultPatchline;
    }

    const content = fs.readFileSync(gradlePropertiesPath, 'utf8');
    const match = content.match(/^\s*patchline\s*=\s*(.+)\s*$/m);
    const patchline = match?.[1]?.trim();

    return patchline || defaultPatchline;
}
