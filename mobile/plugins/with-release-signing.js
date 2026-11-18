// Signs release builds with CampusVerse's own upload key instead of the shared debug key.
//
// The key and its passwords never live in this repository. Gradle reads them from the build
// machine's own ~/.gradle/gradle.properties:
//
//   CAMPUSVERSE_UPLOAD_STORE_FILE=C:/Users/you/.campusverse/campusverse-upload.jks
//   CAMPUSVERSE_UPLOAD_STORE_PASSWORD=...
//   CAMPUSVERSE_UPLOAD_KEY_ALIAS=campusverse-upload
//   CAMPUSVERSE_UPLOAD_KEY_PASSWORD=...
//
// Without them a release build still works, signed with the debug key, which is fine for trying
// it on a phone but can't be published. See mobile/README.md, "Building for release".
const { withAppBuildGradle } = require("expo/config-plugins");

const MARK = "// with-release-signing";

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (gradle.includes(MARK)) return mod;

    gradle = gradle.replace(
      /signingConfigs\s*\{/,
      (match) => `${match}
        ${MARK}
        release {
            if (project.hasProperty('CAMPUSVERSE_UPLOAD_STORE_FILE')) {
                storeFile file(CAMPUSVERSE_UPLOAD_STORE_FILE)
                storePassword CAMPUSVERSE_UPLOAD_STORE_PASSWORD
                keyAlias CAMPUSVERSE_UPLOAD_KEY_ALIAS
                keyPassword CAMPUSVERSE_UPLOAD_KEY_PASSWORD
            }
        }`,
    );
    gradle = gradle.replace(
      /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/,
      (_, before) =>
        `${before}signingConfig project.hasProperty('CAMPUSVERSE_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`,
    );
    mod.modResults.contents = gradle;
    return mod;
  });
};
