// Builds a signed release APK and files it in dist/ under its version:
//   dist/CampusVerse-v1.1.0-build3.apk  (+ .sha256)
// The version and build number come from app.json (expo.version, expo.android.versionCode).
// Raise both before each release: Android only installs an update with a higher build number,
// so a build number that's already in dist/ is refused rather than overwritten.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { expo } = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
const version = expo.version;
const build = expo.android?.versionCode;
if (!version || !Number.isInteger(build)) {
  throw new Error("app.json needs expo.version and expo.android.versionCode.");
}

const dist = join(root, "dist");
const name = `CampusVerse-v${version}-build${build}.apk`;
const target = join(dist, name);
if (existsSync(target)) {
  console.error(`${name} already exists. Raise expo.android.versionCode (and expo.version) in app.json.`);
  process.exit(1);
}

const signing = join(homedir(), ".gradle", "gradle.properties");
const signed = existsSync(signing) && readFileSync(signing, "utf8").includes("CAMPUSVERSE_UPLOAD_STORE_FILE=");
if (!signed) console.warn("No upload key configured: this APK will be signed with the debug key (not publishable).");

const windows = process.platform === "win32";
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit", shell: windows });

console.log(`Building CampusVerse ${version} (build ${build})…`);
run("npx", ["expo", "prebuild", "--platform", "android", "--no-install"], root);
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const localProps = join(root, "android", "local.properties");
if (sdk && !existsSync(localProps)) writeFileSync(localProps, `sdk.dir=${sdk.replaceAll("\\", "/")}\n`);
// By full path: Windows' shell doesn't always look in the current folder for gradlew.bat.
const gradlew = join(root, "android", windows ? "gradlew.bat" : "gradlew");
run(windows ? `"${gradlew}"` : gradlew, ["app:assembleRelease", "--console=plain"], join(root, "android"));

const apk = join(root, "android", "app", "build", "outputs", "apk", "release", "app-release.apk");
mkdirSync(dist, { recursive: true });
copyFileSync(apk, target);
const sha = createHash("sha256").update(readFileSync(target)).digest("hex");
writeFileSync(`${target}.sha256`, `${sha}  ${name}\n`);
const mb = (statSync(target).size / 1048576).toFixed(1);
console.log(`\n${name}  ${mb} MB  ${signed ? "signed with the upload key" : "DEBUG-signed"}\nsha256 ${sha}`);
