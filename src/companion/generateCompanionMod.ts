import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as os from 'os';
import * as util from 'util';
import { replaceTokens } from '../utils/stringUtils';
import { getCompanionPaths } from '../utils/companionPaths';

const COMPANION_TEMPLATE_DIR_NAME = 'templates/companion-mod';
const execFileAsync = util.promisify(cp.execFile);
const PATCHLINE_OPTIONS = ['release', 'pre-release'] as const;
const DEFAULT_PATCHLINE = 'release';

type Patchline = typeof PATCHLINE_OPTIONS[number];

let companionGenerationInProgress: Promise<void> | undefined;

export async function ensureCompanionModGenerated(context: vscode.ExtensionContext): Promise<void> {
    if (companionGenerationInProgress) {
        return companionGenerationInProgress;
    }

    companionGenerationInProgress = generateCompanionMod(context)
        .finally(() => {
            companionGenerationInProgress = undefined;
        });

    return companionGenerationInProgress;
}

async function generateCompanionMod(context: vscode.ExtensionContext): Promise<void> {
    const templatePath = context.asAbsolutePath(COMPANION_TEMPLATE_DIR_NAME);
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Companion template not found: ${templatePath}`);
    }

    const companionPaths = getCompanionPaths(context);
    fs.mkdirSync(companionPaths.extensionStoragePath, { recursive: true });
    fs.mkdirSync(companionPaths.schemaOutputPath, { recursive: true });
    const patchline = resolveCompanionPatchline();

    const replacements = {
        '{{COMPANION_SCHEMA_OUTPUT_PATH}}': normalizePath(companionPaths.schemaOutputPath),
        '{{COMPANION_PATCHLINE}}': patchline
    };

    fs.rmSync(companionPaths.companionProjectPath, { recursive: true, force: true });
    await copyTemplateRecursive(templatePath, companionPaths.companionProjectPath, replacements);

    const runtimeJarName = await buildCompanionMod(companionPaths.companionProjectPath, companionPaths.companionModArtifactPath);

    const metadataPath = path.join(companionPaths.companionProjectPath, '.hytale-devtools-companion.json');
    fs.writeFileSync(metadataPath, `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        sourceTemplatePath: templatePath,
        companionProjectPath: companionPaths.companionProjectPath,
        companionModArtifactPath: companionPaths.companionModArtifactPath,
        runtimeJarName,
        schemaOutputPath: companionPaths.schemaOutputPath
    }, null, 2)}\n`, 'utf8');
}

async function copyTemplateRecursive(src: string, dest: string, replacements: Record<string, string>): Promise<void> {
    if (!fs.existsSync(src)) {
        return;
    }

    const stats = fs.lstatSync(src);

    if (stats.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(src);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.symlinkSync(linkTarget, dest);
        return;
    }

    if (stats.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src);
        for (const entry of entries) {
            await copyTemplateRecursive(path.join(src, entry), path.join(dest, entry), replacements);
        }
        return;
    }

    const isTemplate = src.endsWith('.template');
    const destinationPath = isTemplate ? dest.substring(0, dest.length - '.template'.length) : dest;

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

    if (isTemplate) {
        const content = fs.readFileSync(src, 'utf8');
        fs.writeFileSync(destinationPath, replaceTokens(content, replacements), 'utf8');
        return;
    }

    fs.copyFileSync(src, destinationPath);
}

function normalizePath(value: string): string {
    return value.replace(/\\/g, '/');
}

function resolveCompanionPatchline(): Patchline {
    const configuredPatchline = vscode.workspace
        .getConfiguration('hytale-devtools')
        .get<string>('companionPatchline', 'auto')
        ?.trim()
        .toLowerCase();

    if (configuredPatchline === 'release' || configuredPatchline === 'pre-release') {
        return configuredPatchline;
    }

    return detectInstalledPatchline() ?? DEFAULT_PATCHLINE;
}

function detectInstalledPatchline(): Patchline | undefined {
    const hytaleHome = getHytaleHome();

    for (const patchline of PATCHLINE_OPTIONS) {
        const serverJarPath = path.join(hytaleHome, 'install', patchline, 'package', 'game', 'latest', 'Server', 'HytaleServer.jar');
        if (fs.existsSync(serverJarPath)) {
            return patchline;
        }
    }

    return undefined;
}

function getHytaleHome(): string {
    const home = os.homedir();
    if (process.platform === 'win32') {
        return path.join(home, 'AppData', 'Roaming', 'Hytale');
    }

    if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'Hytale');
    }

    return path.join(home, '.hytale');
}

async function buildCompanionMod(projectPath: string, artifactDirectory: string): Promise<string> {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'cmd' : 'bash';
    const args = isWindows
        ? ['/c', 'gradlew.bat', 'build', '--no-daemon']
        : ['./gradlew', 'build', '--no-daemon'];

    try {
        await execFileAsync(command, args, {
            cwd: projectPath,
            maxBuffer: 1024 * 1024 * 20
        });
    } catch (error: any) {
        const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
        const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
        const buildOutput = `${stdout}\n${stderr}`.trim();
        const tailLines = buildOutput.split(/\r?\n/).slice(-40).join('\n');
        throw new Error(`Companion mod build failed.\n${tailLines}`);
    }

    if (!fs.existsSync(artifactDirectory)) {
        throw new Error(`Companion mod build completed, but artifacts directory is missing: ${artifactDirectory}`);
    }

    const artifactFiles = fs.readdirSync(artifactDirectory);
    const runtimeJar = artifactFiles.find(file =>
        file.endsWith('.jar') &&
        !file.endsWith('-sources.jar') &&
        !file.endsWith('-javadoc.jar')
    );

    if (!runtimeJar) {
        throw new Error(`Companion mod build completed, but no runtime jar was found in: ${artifactDirectory}`);
    }

    return runtimeJar;
}
