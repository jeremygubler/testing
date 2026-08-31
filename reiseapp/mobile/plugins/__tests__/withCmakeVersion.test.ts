import { addCmakeVersion, DEFAULT_VERSION } from '../withCmakeVersion';

const TEMPLATE = `apply plugin: "com.android.application"

android {
    ndkVersion rootProject.ext.ndkVersion
    compileSdk rootProject.ext.compileSdkVersion

    defaultConfig {
        applicationId 'ch.fernspur.app'
    }
}
`;

describe('addCmakeVersion', () => {
  it('puts the block directly inside the android block', () => {
    const out = addCmakeVersion(TEMPLATE, '4.1.2');
    const lines = out.split('\n');
    const androidLine = lines.findIndex((line) => line === 'android {');

    expect(lines[androidLine + 1]).toBe('    externalNativeBuild {');
    expect(lines[androidLine + 2]).toBe('        cmake {');
    expect(lines[androidLine + 3]).toBe('            version "4.1.2"');
    expect(lines[androidLine + 4]).toBe('        }');
    expect(lines[androidLine + 5]).toBe('    }');
  });

  it('keeps the rest of the file intact', () => {
    const out = addCmakeVersion(TEMPLATE, DEFAULT_VERSION);
    expect(out).toContain("applicationId 'ch.fernspur.app'");
    expect(out).toContain('ndkVersion rootProject.ext.ndkVersion');
  });

  // prebuild runs repeatedly, and every run reapplies the plugin.
  it('is idempotent', () => {
    const once = addCmakeVersion(TEMPLATE, '4.1.2');
    expect(addCmakeVersion(once, '4.1.2')).toBe(once);
  });

  it('does not overwrite a version somebody set by hand', () => {
    const byHand = TEMPLATE.replace(
      'android {',
      'android {\n    externalNativeBuild {\n        cmake {\n            version "3.31.6"\n        }\n    }',
    );
    expect(addCmakeVersion(byHand, '4.1.2')).toBe(byHand);
  });

  // Better a loud failure at prebuild than a build that mysteriously ignores
  // the setting because the template moved.
  it('throws when the android block is missing', () => {
    expect(() => addCmakeVersion('// nothing here\n', '4.1.2')).toThrow(/android \{/);
  });
});
