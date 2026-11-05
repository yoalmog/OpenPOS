const fs = require("node:fs");
const path = require("node:path");

const packageFiles = new Set();
try {
  packageFiles.add(require.resolve("iconv-lite/package.json"));
} catch {}

try {
  const bodyParserPackage = require.resolve("body-parser/package.json");
  packageFiles.add(
    require.resolve("iconv-lite/package.json", {
      paths: [path.dirname(bodyParserPackage)]
    })
  );
} catch {}

if (packageFiles.size === 0) {
  throw new Error("Could not locate the iconv-lite package used by Express/body-parser.");
}

let patched = 0;
for (const packageFile of packageFiles) {
  const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  const browserMap = packageJson.browser;

  if (
    browserMap &&
    (browserMap["./lib/streams"] === false ||
      browserMap["./lib/extend-node"] === false ||
      browserMap.stream === false)
  ) {
    delete packageJson.browser;
    fs.writeFileSync(packageFile, JSON.stringify(packageJson, null, 2) + "\n");
    patched += 1;
    console.log(`Patched Node.js stream resolution for iconv-lite ${packageJson.version}.`);
  }
}

if (patched === 0) {
  console.log("iconv-lite already has a Worker-compatible package mapping.");
}
