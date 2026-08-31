import type { ConfigPlugin } from 'expo/config-plugins';

export declare const DEFAULT_VERSION: string;

/** Inserts an externalNativeBuild/cmake/version block into app/build.gradle. */
export declare function addCmakeVersion(contents: string, version: string): string;

declare const withCmakeVersion: ConfigPlugin<{ version?: string } | undefined>;
export default withCmakeVersion;
