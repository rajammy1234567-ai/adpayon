const path = require('path');
const dotenv = require('dotenv');
const { spawn } = require('child_process');

// Explicitly load .env.sandbox with override
const envPath = path.resolve(__dirname, '../.env.sandbox');
const result = dotenv.config({ path: envPath, override: true });

if (result.error) {
  console.error('[SANDBOX LAUNCHER ERROR] Failed to load .env.sandbox:', result.error.message);
  process.exit(1);
}

process.env.APP_ENV = 'sandbox';
process.env.EXPO_PUBLIC_APP_ENV = 'sandbox';

console.log('====================================================');
console.log('ADPAYON MOBILE: LAUNCHING IN SANDBOX ENVIRONMENT');
console.log('----------------------------------------------------');
console.log('API Target: ', process.env.EXPO_PUBLIC_API_URL);
console.log('Host Mode:  Localhost (USB adb reverse mode)');
console.log('Security:   Public tunnels disabled, zero db secrets bundled');
console.log('====================================================\n');

// Forward arguments to expo start (defaults to --localhost for USB adb reverse)
const userArgs = process.argv.slice(2);
const hasHost = userArgs.some((arg) => arg === '--localhost' || arg === '--lan' || arg === '--tunnel' || arg.startsWith('--host'));
const defaultHostArg = hasHost ? [] : ['--localhost'];
const expoArgs = ['expo', 'start', ...defaultHostArg, ...userArgs];


const child = spawn('npx', expoArgs, {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
