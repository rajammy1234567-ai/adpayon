const { withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to ensure PackageInstallChecker native module
 * and package files survive `expo prebuild` / EAS Build workflows
 * and are automatically registered in MainApplication.kt (New Architecture).
 *
 * @param {import('@expo/config-plugins').ConfigPlugin} config
 */
function withPackageInstallChecker(config) {
  // 1. Copy native Kotlin files into Android project source tree during dangerous mod phase
  config = withDangerousMod(config, [
    'android',
    async (configProps) => {
      const sourceDir = path.join(__dirname, 'native');
      const targetDir = path.join(
        configProps.modRequest.platformProjectRoot,
        'app/src/main/java/com/adpayon/app'
      );

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const filesToCopy = [
        'PackageInstallCheckerModule.kt',
        'PackageInstallCheckerPackage.kt',
      ];

      for (const fileName of filesToCopy) {
        const srcFile = path.join(sourceDir, fileName);
        const destFile = path.join(targetDir, fileName);
        if (fs.existsSync(srcFile)) {
          fs.copyFileSync(srcFile, destFile);
        }
      }

      return configProps;
    },
  ]);

  // 2. Register PackageInstallCheckerPackage in MainApplication.kt
  config = withMainApplication(config, (configProps) => {
    let contents = configProps.modResults.contents;

    // Check if PackageInstallCheckerPackage is already registered
    if (!contents.includes('PackageInstallCheckerPackage()')) {
      // New Architecture (Expo SDK 52-57+ / React Native 0.76-0.86+)
      if (contents.includes('packageList = PackageList(this).packages')) {
        contents = contents.replace(
          'packageList = PackageList(this).packages',
          'packageList =\n        PackageList(this).packages.apply {\n          add(PackageInstallCheckerPackage())\n        }'
        );
      } else if (contents.includes('PackageList(this).packages')) {
        contents = contents.replace(
          'PackageList(this).packages',
          'PackageList(this).packages.apply {\n          add(PackageInstallCheckerPackage())\n        }'
        );
      }
    }

    configProps.modResults.contents = contents;
    return configProps;
  });

  return config;
}

module.exports = withPackageInstallChecker;

