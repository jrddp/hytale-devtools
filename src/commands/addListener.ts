import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as os from 'os';
import { toPascalCase } from '../utils/stringUtils';

// Helper to resolve Hytale Home Directory
function getHytaleHome(): string {
    const home = os.homedir();
    if (process.platform === 'win32') {
        return path.join(home, 'AppData', 'Roaming', 'Hytale');
    } else if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'Hytale');
    } else {
        // Fallback or Linux support if needed
        return path.join(home, '.hytale');
    }
}

// Java Source for Event Scanner
const EVENT_SCANNER_SOURCE = `
import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.Enumeration;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

public class EventScanner {
    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("Usage: EventScanner <hytale_server_jar_path>");
            System.exit(1);
        }

        String jarPath = args[0];
        try (JarFile jarFile = new JarFile(jarPath)) {
            URL[] urls = { new URL("jar:file:" + jarPath + "!/") };
            URLClassLoader classLoader = URLClassLoader.newInstance(urls);

            // Dynamically load IEvent class
            Class<?> iEventClass;
            try {
                iEventClass = classLoader.loadClass("com.hypixel.hytale.event.IEvent");
            } catch (ClassNotFoundException e) {
                System.err.println("Could not find com.hypixel.hytale.event.IEvent in the provided jar.");
                return;
            }

            Enumeration<JarEntry> entries = jarFile.entries();
            while (entries.hasMoreElements()) {
                JarEntry entry = entries.nextElement();
                if (entry.isDirectory() || !entry.getName().endsWith(".class")) {
                    continue;
                }

                // Convert path to class name
                String className = entry.getName().replace('/', '.').replace(".class", "");
                
                // Skip seemingly non-event packages to save time/errors, but keep it broad enough
                if (!className.startsWith("com.hypixel")) {
                    continue;
                }

                try {
                    Class<?> loadedClass = classLoader.loadClass(className);
                    
                    // Check if it implements IEvent
                    if (iEventClass.isAssignableFrom(loadedClass) 
                            && !loadedClass.isInterface() 
                            && !java.lang.reflect.Modifier.isAbstract(loadedClass.getModifiers())) {
                        System.out.println(className);
                    }
                } catch (Throwable t) {
                    // Ignore classes that fail to load (missing dependencies, etc.)
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
`;

export async function addListener(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace open');
        return;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;

    // 1. Resolve Properties
    const gradlePropsPath = path.join(rootPath, 'gradle.properties');
    if (!fs.existsSync(gradlePropsPath)) {
        vscode.window.showErrorMessage('gradle.properties not found. Is this a Hytale mod project?');
        return;
    }

    const propsContent = fs.readFileSync(gradlePropsPath, 'utf-8');
    const patchlineMatch = propsContent.match(/patchline=(.+)/);
    const patchline = patchlineMatch ? patchlineMatch[1].trim() : 'release'; // Default to release if not found

    const hytaleHome = getHytaleHome();
    const serverJarPath = path.join(hytaleHome, 'install', patchline, 'package', 'game', 'latest', 'Server', 'HytaleServer.jar');

    if (!fs.existsSync(serverJarPath)) {
        vscode.window.showErrorMessage(`HytaleServer.jar not found at: ${serverJarPath}`);
        return;
    }

    // 2. Discover Events
    const events = await discoverEvents(serverJarPath);
    if (events.length === 0) {
        vscode.window.showWarningMessage('No events found in HytaleServer.jar.');
        return;
    }

    // 3. Prompt User
    // Map events to QuickPick items
    const quickPickItems = events.map(eventClass => {
        const simpleName = eventClass.substring(eventClass.lastIndexOf('.') + 1).replace('$', '.');

        return {
            label: simpleName,
            description: eventClass.substring(0, eventClass.lastIndexOf('.')), // package
            detail: eventClass // full class for internal use
        };
    });

    const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select an event to listen to',
        matchOnDescription: true
    });

    if (!selectedItem) {
        return;
    }

    // 4. Generate & Register
    try {
        await generateListener(rootPath, selectedItem.detail);
        vscode.window.showInformationMessage(`Listener for ${selectedItem.label} created and registered!`);
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to create listener: ${e.message}`);
    }
}

async function discoverEvents(jarPath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const tempDir = os.tmpdir();
        const scannerFile = path.join(tempDir, 'EventScanner.java');

        fs.writeFileSync(scannerFile, EVENT_SCANNER_SOURCE, 'utf8');

        const cmd = `java -cp "${jarPath}" "${scannerFile}" "${jarPath}"`;

        vscode.window.setStatusBarMessage('$(sync~spin) Scanning Hytale events...',
            new Promise((_, __) => { /* keep scanning until process finishes */ })
        );

        cp.exec(cmd, { maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
            vscode.window.setStatusBarMessage(''); // Clear status
            if (err) {
                console.error('Scan Error:', stderr);
                resolve([]);
                return;
            }

            const lines = stdout.split(/\r?\n/).filter(line => line.trim().length > 0);
            const eventClasses = lines.map(l => l.trim()).sort();
            resolve(eventClasses);
        });
    });
}

async function generateListener(root: string, eventFullClass: string) {
    // 1. Analyze Manifest to find Main class and package
    const manifestPath = path.join(root, 'src', 'main', 'resources', 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error('manifest.json not found');
    }

    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);
    const mainClassFull = manifest.Main;

    if (!mainClassFull) {
        throw new Error('Main class not defined in manifest.json');
    }

    // Derive package from Main class
    const lastDotIndex = mainClassFull.lastIndexOf('.');
    const mainPackage = mainClassFull.substring(0, lastDotIndex);

    // 2. Create Listener File
    let simpleNameRaw = eventFullClass.substring(eventFullClass.lastIndexOf('.') + 1);

    let eventNameForClass = simpleNameRaw;
    let importClass = eventFullClass;
    let registrationClassRef = simpleNameRaw + '.class';

    if (simpleNameRaw.includes('$')) {
        const parts = simpleNameRaw.split('$');
        const baseName = parts[0];
        const subName = parts[1];

        // Smart Naming: PlayerGroupEvent + Removed -> PlayerGroupRemovedEvent
        const basePrefix = baseName.endsWith('Event') ? baseName.substring(0, baseName.length - 5) : baseName;
        eventNameForClass = basePrefix + subName + 'Event';

        // Import outer class if inner
        const outerClassFull = eventFullClass.substring(0, eventFullClass.indexOf('$'));
        importClass = outerClassFull;

        // Registration ref: PlayerGroupEvent.Removed.class
        registrationClassRef = simpleNameRaw.replace(/\$/g, '.') + '.class';
    } else {
        // Standard Case
        eventNameForClass = simpleNameRaw;
        registrationClassRef = simpleNameRaw + '.class';
    }

    const listenerClassName = `${eventNameForClass}Listener`;
    const onMethodName = `on${eventNameForClass}`;

    const listenersPackage = `${mainPackage}.listeners`;
    const listenersPath = path.join(root, 'src', 'main', 'java', ...listenersPackage.split('.'));

    if (!fs.existsSync(listenersPath)) {
        fs.mkdirSync(listenersPath, { recursive: true });
    }

    const listenerFile = path.join(listenersPath, `${listenerClassName}.java`);

    // Type ref in method arg
    const eventTypeRef = simpleNameRaw.replace(/\$/g, '.');

    const listenerContent = `package ${listenersPackage};

import ${importClass};

public class ${listenerClassName} {

    public static void ${onMethodName}(${eventTypeRef} event) {
        // TODO: Handle event
    }

}
`;
    if (fs.existsSync(listenerFile)) {
        throw new Error(`Listener file ${listenerClassName}.java already exists.`);
    }

    fs.writeFileSync(listenerFile, listenerContent, 'utf8');

    // 3. Register in Main class
    const mainPath = path.join(root, 'src', 'main', 'java', ...mainClassFull.split('.')) + '.java';
    let mainContent = fs.readFileSync(mainPath, 'utf8');

    const importStr1 = `import ${importClass};`;
    const importStr2 = `import ${listenersPackage}.${listenerClassName};`;

    if (!mainContent.includes(importStr1)) {
        mainContent = addImport(mainContent, importStr1);
    }
    if (!mainContent.includes(importStr2)) {
        mainContent = addImport(mainContent, importStr2);
    }

    const setupRegex = /(protected\s+void\s+setup\(\)\s*\{)([\s\S]*?)(\n\s*\})/;
    const match = mainContent.match(setupRegex);

    if (match) {
        const methodBody = match[2];
        const closingBrace = match[3];

        const registrationLine = `\n        this.getEventRegistry().registerGlobal(${registrationClassRef}, ${listenerClassName}::${onMethodName});`;

        const newMethodBody = methodBody + registrationLine;
        mainContent = mainContent.replace(match[0], match[1] + newMethodBody + closingBrace);

        fs.writeFileSync(mainPath, mainContent, 'utf8');
    } else {
        vscode.window.showWarningMessage('Could not find setup() method in Main class to auto-register the listener. Please register it manually.');
    }
}

function addImport(content: string, importStatement: string): string {
    const lastImportIdx = content.lastIndexOf('import ');
    if (lastImportIdx !== -1) {
        const endOfLine = content.indexOf('\n', lastImportIdx);
        return content.slice(0, endOfLine + 1) + importStatement + '\n' + content.slice(endOfLine + 1);
    } else {
        const packageIdx = content.indexOf('package ');
        if (packageIdx !== -1) {
            const endOfLine = content.indexOf('\n', packageIdx);
            return content.slice(0, endOfLine + 1) + '\n' + importStatement + '\n' + content.slice(endOfLine + 1);
        }
        return importStatement + '\n' + content;
    }
}
