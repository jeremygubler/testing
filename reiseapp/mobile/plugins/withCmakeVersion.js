const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Pins the CMake version the Android build uses.
 *
 * Why this has to exist: the CMake that ships with the Android SDK by default
 * (3.22.1) bundles a ninja from 2021 that cannot handle paths over 260
 * characters. React Native's codegen embeds the absolute source path a second
 * time inside the object path, which puts gesture-handler's shadow nodes at
 * roughly 380 characters on Windows. The build then dies with
 *
 *   ninja: error: Stat(...ShadowNode.cpp.o): Filename longer than 260 characters
 *
 * and no amount of moving the project shortens it enough — 294 of those
 * characters are fixed regardless of where the checkout lives. A current CMake
 * brings a long-path-aware ninja, which fixes it outright (the Windows registry
 * flag LongPathsEnabled must be on as well).
 *
 * android/ is generated, so editing app/build.gradle by hand loses the setting
 * on the next prebuild. Hence a plugin.
 */

const DEFAULT_VERSION = '4.1.2';

/** Pure so it can be tested without running a prebuild. */
function addCmakeVersion(contents, version) {
  // Already configured — by us on an earlier run, or by hand. Leave it be:
  // overwriting someone's deliberate choice is worse than doing nothing.
  if (/externalNativeBuild\s*\{[^}]*cmake\s*\{[^}]*version\s/.test(contents)) {
    return contents;
  }

  const anchor = /^android\s*\{[ \t]*$/m;
  if (!anchor.test(contents)) {
    throw new Error(
      "withCmakeVersion: no 'android {' block found in app/build.gradle — " +
        'the template changed and this plugin needs updating.',
    );
  }

  const block = [
    '',
    '    externalNativeBuild {',
    '        cmake {',
    `            version "${version}"`,
    '        }',
    '    }',
  ].join('\n');

  return contents.replace(anchor, (match) => match + block);
}

const withCmakeVersion = (config, props) => {
  const version = (props && props.version) || DEFAULT_VERSION;
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error(
        `withCmakeVersion: expected a Groovy build.gradle, got ${gradleConfig.modResults.language}.`,
      );
    }
    gradleConfig.modResults.contents = addCmakeVersion(gradleConfig.modResults.contents, version);
    return gradleConfig;
  });
};

module.exports = withCmakeVersion;
module.exports.addCmakeVersion = addCmakeVersion;
module.exports.DEFAULT_VERSION = DEFAULT_VERSION;
