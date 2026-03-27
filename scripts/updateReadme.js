import fs from "fs";

const readme = fs.readFileSync("README.md", "utf8");
const stats = fs.readFileSync("stats.md", "utf8");
const now = new Date();
const updatedTime = now.toLocaleString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Vancouver"
});

let updated = readme.replace(
    /<!-- STATS:START -->[\s\S]*?<!-- STATS:END -->/,
    `<!-- STATS:START -->\n${stats}\n<!-- STATS:END -->`
);

updated = updated.replace(
    /<!-- LAST_UPDATED:START -->[\s\S]*?<!-- LAST_UPDATED:END -->/,
    `<!-- LAST_UPDATED:START -->\nLast updated: ${updatedTime} (Vancouver time)\n<!-- LAST_UPDATED:END -->`
);

fs.writeFileSync("README.md", updated);
console.log(`README updated at ${updatedTime} PST/PDT (America/Vancouver)`);