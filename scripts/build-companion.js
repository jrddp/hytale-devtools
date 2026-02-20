const cp = require('child_process');
const path = require('path');
const fs = require('fs');

const companionProjectPath = path.resolve(__dirname, '..', 'companion-mod');
if (!fs.existsSync(companionProjectPath)) {
    throw new Error(`Companion mod project not found at: ${companionProjectPath}`);
}

const isWindows = process.platform === 'win32';
const command = isWindows ? 'cmd' : 'bash';
const args = isWindows
    ? ['/c', 'gradlew.bat', 'build', '--no-daemon']
    : ['./gradlew', 'build', '--no-daemon'];

cp.execFileSync(command, args, {
    cwd: companionProjectPath,
    stdio: 'inherit'
});
