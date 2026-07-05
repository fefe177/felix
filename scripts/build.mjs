/* Baut aus den modularen Quellen eine eigenständige Einzeldatei:
   dist/index.html (CSS + JS inline, ohne externe Referenzen).
   Aufruf:  node scripts/build.mjs                                        */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(root, p), "utf8");

const css = read("css/styles.css");
const jsFiles = ["sound", "main", "slots", "roulette", "blackjack", "dice", "coinflip", "videopoker"];
const jsInline = jsFiles.map(n => `<script>\n${read("js/" + n + ".js")}\n</script>`).join("\n");

const standalone = read("index.html")
  .replace('<link rel="stylesheet" href="css/styles.css" />', `<style>\n${css}\n</style>`)
  .replace(/\s*<script src="js\/[^"]+"><\/script>/g, "")
  .replace("</body>", `${jsInline}\n</body>`);

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/index.html"), standalone);
console.log("dist/index.html gebaut:", standalone.length, "Bytes");
