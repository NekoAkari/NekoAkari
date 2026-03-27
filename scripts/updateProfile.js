import fs from "fs";

const config = {
  username: "NekoAkari",
  timeZone: "America/Vancouver",
  readmePath: "README.md",
};

function formatUpdatedTime() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: config.timeZone,
  }).format(new Date());
}

async function fetchGitHubProfile() {
  const response = await fetch(`https://api.github.com/users/${config.username}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": `${config.username}-profile-readme-updater`,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function buildStatsSection(profile) {
  return [
    `- 👤 User: ${profile.login}`,
    `- 📦 Public Repos: ${profile.public_repos}`,
    `- 👥 Followers: ${profile.followers}`,
    `- 🔁 Following: ${profile.following}`,
  ].join("\n");
}

function updateReadme(readme, stats, updatedTime) {
  const withStats = readme.replace(
    /<!-- STATS:START -->[\s\S]*?<!-- STATS:END -->/,
    `<!-- STATS:START -->\n\n${stats}\n\n<!-- STATS:END -->`
  );

  return withStats.replace(
    /<!-- LAST_UPDATED:START -->[\s\S]*?<!-- LAST_UPDATED:END -->/,
    `<!-- LAST_UPDATED:START -->\nLast updated: ${updatedTime} (Vancouver time)\n<!-- LAST_UPDATED:END -->`
  );
}

async function main() {
  const profile = await fetchGitHubProfile();
  const readme = fs.readFileSync(config.readmePath, "utf8");
  const stats = buildStatsSection(profile);
  const updatedTime = formatUpdatedTime();
  const nextReadme = updateReadme(readme, stats, updatedTime);

  fs.writeFileSync(config.readmePath, nextReadme);
  console.log(`README updated for ${config.username} at ${updatedTime} (${config.timeZone})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
