// Windows: CMake 3.22's bundled ninja is not long-path aware, and CMake names native object
// files after their full source path ("G_/campus_verse/mobile/node_modules/react-native-gesture-
// handler/..."), which overflows 260 characters: "Filename longer than 260 characters".
// CMake 3.31 ships a ninja that handles long paths (with Windows' LongPathsEnabled on), so the
// app's native build uses it. Android Studio's SDK manager installs it on first build.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARK = "// with-short-native-paths";
const CMAKE_VERSION = "3.31.6";

module.exports = function withShortNativePaths(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes(MARK)) return mod;
    mod.modResults.contents = mod.modResults.contents.replace(
      /\nandroid\s*\{/,
      (match) => `${match}
    ${MARK}
    externalNativeBuild {
        cmake {
            version "${CMAKE_VERSION}"
        }
    }`,
    );
    return mod;
  });
};
