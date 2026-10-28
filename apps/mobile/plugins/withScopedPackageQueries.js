const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Repeatable Expo Config Plugin to declare scoped Android package names
 * in AndroidManifest.xml <queries> element for Android 11+ (API 30+)
 * package visibility requirements without requiring broad QUERY_ALL_PACKAGES.
 *
 * @param {import('@expo/config-plugins').ConfigPlugin} config
 * @param {string[] | string} packages Target package name(s) to declare in <queries>
 */
function withScopedPackageQueries(config, packages = ['com.sfarmart.userapp']) {
  return withAndroidManifest(config, (configProps) => {
    const androidManifest = configProps.modResults;
    if (!androidManifest.manifest) {
      return configProps;
    }

    if (!Array.isArray(androidManifest.manifest.queries)) {
      androidManifest.manifest.queries = [];
    }

    let queries = androidManifest.manifest.queries[0];
    if (!queries) {
      queries = {};
      androidManifest.manifest.queries.push(queries);
    }

    if (!Array.isArray(queries.package)) {
      queries.package = [];
    }

    const packageList = Array.isArray(packages) ? packages : [packages];

    for (const pkgName of packageList) {
      if (!pkgName || typeof pkgName !== 'string') continue;
      const alreadyDeclared = queries.package.some(
        (entry) => entry && entry.$ && entry.$['android:name'] === pkgName
      );
      if (!alreadyDeclared) {
        queries.package.push({
          $: {
            'android:name': pkgName,
          },
        });
      }
    }

    return configProps;
  });
}

module.exports = withScopedPackageQueries;
