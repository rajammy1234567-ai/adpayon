const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  projectRoot,
  path.resolve(projectRoot, 'packages/shared'),
  path.resolve(projectRoot, 'apps/mobile'),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(projectRoot, 'apps/mobile/node_modules'),
];

config.resolver.extraNodeModules = {
  '@adpayon/shared': path.resolve(projectRoot, 'packages/shared'),
};

module.exports = config;
