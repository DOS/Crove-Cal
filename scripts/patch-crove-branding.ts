import * as fs from "fs";
import * as path from "path";

/**
 * Automates Crove branding patch for translation files and assets
 * Keeps upstream compatibility by patching generated/locale strings cleanly.
 */
function patchTranslations() {
  const localesDir = path.resolve(__dirname, "../packages/i18n/locales");
  if (!fs.existsSync(localesDir)) {
    console.log("Locales directory not found:", localesDir);
    return;
  }

  const replacements: [RegExp, string][] = [
    [/\bCal\.diy\b/g, "Crove"],
    [/\bCal\.com, Inc\.\b/g, "MetaDOS LLC"],
    [/\bCal\.com\b/g, "Crove"],
    [/\bCal\.ai\b/g, "Crove AI"],
    [/\bCal Video\b/g, "Crove Video"],
    [/\bhelp@cal\.com\b/g, "help@crove.com"],
  ];

  const files = fs.readdirSync(localesDir);
  for (const lang of files) {
    const commonJsonPath = path.join(localesDir, lang, "common.json");
    if (fs.existsSync(commonJsonPath)) {
      let content = fs.readFileSync(commonJsonPath, "utf8");
      let count = 0;
      for (const [pattern, replacement] of replacements) {
        const matches = content.match(pattern);
        if (matches) {
          count += matches.length;
          content = content.replace(pattern, replacement);
        }
      }
      fs.writeFileSync(commonJsonPath, content, "utf8");
      console.log(`[patch:branding] Patched ${count} instances in ${lang}/common.json`);
    }
  }
}

function main() {
  console.log("=== Running Crove Branding Patch ===");
  patchTranslations();
  console.log("=== Crove Branding Patch Completed Successfully ===");
}

main();
