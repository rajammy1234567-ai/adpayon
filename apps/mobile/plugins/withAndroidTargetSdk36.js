const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to ensure Android Target SDK 36 (Android 16 / Baklava),
 * Compile SDK 36, and Build Tools 36.0.0 are set in gradle.properties
 * for Google Play compliance and React Native 0.86+ compatibility.
 */
function withAndroidTargetSdk36(config) {
  return withGradleProperties(config, (configProps) => {
    const desiredProps = [
      { key: 'android.targetSdkVersion', value: '36' },
      { key: 'android.compileSdkVersion', value: '36' },
      { key: 'android.buildToolsVersion', value: '36.0.0' },
    ];

    for (const prop of desiredProps) {
      const existing = configProps.modResults.find(
        (item) => item.type === 'property' && item.key === prop.key
      );
      if (existing) {
        existing.value = prop.value;
      } else {
        configProps.modResults.push({
          type: 'property',
          key: prop.key,
          value: prop.value,
        });
      }
    }
    return configProps;
  });
}

module.exports = withAndroidTargetSdk36;
