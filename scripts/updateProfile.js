import fs from "fs";

const config = {
  username: "NekoAkari",
  timeZone: "America/Vancouver",
  readmePath: "README.md",
  pulseCardPath: "assets/github-pulse.svg",
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

function getRequestHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": `${config.username}-profile-readme-updater`,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: getRequestHeaders(),
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchGitHubProfile() {
  return fetchJson(`https://api.github.com/users/${config.username}`);
}

async function fetchRepositories() {
  return fetchJson(`https://api.github.com/users/${config.username}/repos?per_page=100&sort=updated`);
}

async function fetchPublicEvents() {
  return fetchJson(`https://api.github.com/users/${config.username}/events/public?per_page=100`);
}

async function fetchRepoCommitCount(repoName) {
  const commits = await fetchJson(`https://api.github.com/repos/${config.username}/${repoName}/commits?per_page=100`);
  return Array.isArray(commits) ? commits.length : 0;
}

async function fetchCommitCountsByLanguage(repos) {
  const sourceRepos = repos.filter((repo) => !repo.fork && repo.language);
  const entries = await Promise.all(
    sourceRepos.map(async (repo) => ({
      language: repo.language,
      commits: await fetchRepoCommitCount(repo.name),
    }))
  );

  const counts = new Map();
  for (const entry of entries) {
    if (entry.commits <= 0) {
      continue;
    }

    counts.set(entry.language, (counts.get(entry.language) ?? 0) + entry.commits);
  }

  return counts;
}

function ensureDirectoryExists(filePath) {
  const directory = filePath.split("/").slice(0, -1).join("/");
  if (directory) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatLocalTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: config.timeZone,
  }).format(date);
}

function formatMonthDay(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: config.timeZone,
  }).format(new Date(dateString));
}

function getLocalDateKey(dateString) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: config.timeZone,
  }).format(new Date(dateString));
}

function getLocalHour(dateString) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: config.timeZone,
    }).format(new Date(dateString))
  );
}

function buildStatsSection(profile) {
  return [
    `- 👤 User: ${profile.login}`,
    `- 📦 Public Repos: ${profile.public_repos}`,
    `- 👥 Followers: ${profile.followers}`,
    `- 🔁 Following: ${profile.following}`,
  ].join("\n");
}

function buildPulseData(profile, repos, events, commitLanguageCounts) {
  const sourceRepos = repos.filter((repo) => !repo.fork);
  const totalStars = sourceRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0);

  const topLanguages = [...commitLanguageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([language, commits]) => ({ language, commits }));

  const recentRepos = sourceRepos
    .slice()
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 3)
    .map((repo) => ({
      name: repo.name,
      updatedAt: repo.updated_at,
    }));

  const activeDays = new Set(events.map((event) => getLocalDateKey(event.created_at))).size;
  const hourCounts = Array.from({ length: 24 }, () => 0);
  for (const event of events) {
    hourCounts[getLocalHour(event.created_at)] += 1;
  }

  const peakHourCount = Math.max(...hourCounts, 0);
  const peakHour = hourCounts.indexOf(peakHourCount);

  return {
    displayName: profile.name || profile.login,
    bio: profile.bio || "Quietly building cozy things on the web.",
    joinedYear: new Date(profile.created_at).getFullYear(),
    publicRepos: profile.public_repos,
    followers: profile.followers,
    following: profile.following,
    totalStars,
    topLanguages,
    recentRepos,
    activeDays,
    eventSampleSize: events.length,
    peakHour,
    peakHourCount,
    currentLocalTime: formatLocalTime(new Date()),
  };
}

function buildLanguageBars(topLanguages) {
  const maxCount = Math.max(...topLanguages.map((item) => item.commits), 1);
  const colors = ["#f4a6b8", "#9fd3c7", "#f6c6a8", "#cdb4db"];

  return topLanguages
    .map((item, index) => {
      const y = 250 + index * 42;
      const width = Math.round((item.commits / maxCount) * 196);

      return `
        <text x="78" y="${y}" class="label">${escapeXml(item.language)}</text>
        <rect x="220" y="${y - 16}" width="206" height="18" rx="9" fill="#f7efe6" />
        <rect x="220" y="${y - 16}" width="${width}" height="18" rx="9" fill="${colors[index % colors.length]}" />
        <text x="438" y="${y}" class="stat-muted" text-anchor="end">${item.commits} commit${item.commits === 1 ? "" : "s"}</text>
      `;
    })
    .join("");
}

function buildRecentRepoLines(recentRepos) {
  return recentRepos
    .map((repo, index) => {
      const y = 336 + index * 28;
      return `
        <circle cx="525" cy="${y - 5}" r="4" fill="#9fd3c7" />
        <text x="540" y="${y}" class="label">${escapeXml(repo.name)}</text>
        <text x="828" y="${y}" class="stat-muted" text-anchor="end">updated ${formatMonthDay(repo.updatedAt)}</text>
      `;
    })
    .join("");
}

function generatePulseSvg(pulse) {
  const languageBars = buildLanguageBars(
    pulse.topLanguages.length > 0 ? pulse.topLanguages : [{ language: "No commit data yet", commits: 1 }]
  );
  const recentRepos = buildRecentRepoLines(
    pulse.recentRepos.length > 0
      ? pulse.recentRepos
      : [{ name: "Still setting things up", updatedAt: new Date().toISOString() }]
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="900" height="500" viewBox="0 0 900 500" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Custom GitHub Pulse card for ${escapeXml(config.username)}</title>
  <desc id="desc">A custom summary card showing profile stats, languages, recent repositories, and local activity time.</desc>
  <defs>
    <linearGradient id="bg" x1="40" y1="30" x2="860" y2="430" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFF8F6" />
      <stop offset="1" stop-color="#F6FBFF" />
    </linearGradient>
    <linearGradient id="header" x1="56" y1="56" x2="844" y2="160" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFE2EA" />
      <stop offset="1" stop-color="#DFF7F1" />
    </linearGradient>
    <filter id="shadow" x="0" y="0" width="900" height="500" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#E9D8E0" flood-opacity="0.45" />
    </filter>
  </defs>

  <style>
    .title { font: 700 32px "Avenir Next", "Segoe UI", sans-serif; fill: #2f3142; }
    .subtitle { font: 500 15px "Avenir Next", "Segoe UI", sans-serif; fill: #5f6884; }
    .section { font: 700 14px "Avenir Next", "Segoe UI", sans-serif; fill: #58627f; letter-spacing: 0.12em; text-transform: uppercase; }
    .metric { font: 700 28px "Avenir Next", "Segoe UI", sans-serif; fill: #2f3142; }
    .metric-label { font: 500 13px "Avenir Next", "Segoe UI", sans-serif; fill: #6e7692; }
    .label { font: 600 16px "Avenir Next", "Segoe UI", sans-serif; fill: #364057; }
    .body { font: 500 14px "Avenir Next", "Segoe UI", sans-serif; fill: #4f5874; }
    .stat-muted { font: 500 13px "Avenir Next", "Segoe UI", sans-serif; fill: #7e88a6; }
    .small { font: 500 12px "Avenir Next", "Segoe UI", sans-serif; fill: #8b94af; }
  </style>

  <g filter="url(#shadow)">
    <rect x="30" y="24" width="840" height="440" rx="32" fill="url(#bg)" />
    <rect x="30.75" y="24.75" width="838.5" height="438.5" rx="31.25" stroke="#F2DDE4" stroke-opacity="0.9" stroke-width="1.5" />
  </g>

  <rect x="56" y="52" width="788" height="112" rx="24" fill="url(#header)" />
  <circle cx="112" cy="108" r="34" fill="#FFFFFF" fill-opacity="0.95" />
  <text x="112" y="118" text-anchor="middle" class="metric" style="font-size: 24px;">N</text>

  <text x="162" y="95" class="title">${escapeXml(pulse.displayName)}</text>
  <text x="162" y="122" class="subtitle">${escapeXml(pulse.bio)}</text>
  <text x="162" y="146" class="small">Joined GitHub in ${pulse.joinedYear} • Local time in Vancouver: ${pulse.currentLocalTime}</text>

  <rect x="58" y="192" width="392" height="220" rx="24" fill="#FFFFFF" fill-opacity="0.88" stroke="#F4E5EA" />
  <text x="78" y="226" class="section">Top Languages by Commit</text>
  ${languageBars}

  <rect x="470" y="192" width="374" height="220" rx="24" fill="#FFFFFF" fill-opacity="0.88" stroke="#E5EFF0" />
  <text x="490" y="226" class="section">Recent Rhythm</text>
  <text x="490" y="254" class="body">Recent public activity sample:</text>
  <text x="490" y="276" class="body">${pulse.eventSampleSize} events across ${pulse.activeDays} active day${pulse.activeDays === 1 ? "" : "s"}.</text>
  <text x="490" y="304" class="body">Most active hour in Vancouver:</text>
  <text x="490" y="326" class="body">${String(pulse.peakHour).padStart(2, "0")}:00 (${pulse.peakHourCount} event${pulse.peakHourCount === 1 ? "" : "s"}).</text>
  <text x="490" y="356" class="section">Recently Touched Repos</text>
  ${recentRepos}

  <g transform="translate(500 70)">
    <rect x="0" y="0" width="76" height="74" rx="20" fill="#FFFFFF" fill-opacity="0.82" />
    <text x="38" y="34" text-anchor="middle" class="metric">${formatCompactNumber(pulse.publicRepos)}</text>
    <text x="38" y="56" text-anchor="middle" class="metric-label">repos</text>
  </g>
  <g transform="translate(590 70)">
    <rect x="0" y="0" width="76" height="74" rx="20" fill="#FFFFFF" fill-opacity="0.82" />
    <text x="38" y="34" text-anchor="middle" class="metric">${formatCompactNumber(pulse.followers)}</text>
    <text x="38" y="56" text-anchor="middle" class="metric-label">followers</text>
  </g>
  <g transform="translate(680 70)">
    <rect x="0" y="0" width="76" height="74" rx="20" fill="#FFFFFF" fill-opacity="0.82" />
    <text x="38" y="34" text-anchor="middle" class="metric">${formatCompactNumber(pulse.following)}</text>
    <text x="38" y="56" text-anchor="middle" class="metric-label">following</text>
  </g>
  <g transform="translate(770 70)">
    <rect x="0" y="0" width="76" height="74" rx="20" fill="#FFFFFF" fill-opacity="0.82" />
    <text x="38" y="34" text-anchor="middle" class="metric">${formatCompactNumber(pulse.totalStars)}</text>
    <text x="38" y="56" text-anchor="middle" class="metric-label">stars</text>
  </g>
</svg>`;
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

function writePulseCard(svg) {
  ensureDirectoryExists(config.pulseCardPath);
  fs.writeFileSync(config.pulseCardPath, svg);
}

async function main() {
  const [profile, repos, events] = await Promise.all([
    fetchGitHubProfile(),
    fetchRepositories(),
    fetchPublicEvents(),
  ]);
  const commitLanguageCounts = await fetchCommitCountsByLanguage(repos);
  const readme = fs.readFileSync(config.readmePath, "utf8");
  const stats = buildStatsSection(profile);
  const pulse = buildPulseData(profile, repos, events, commitLanguageCounts);
  const pulseSvg = generatePulseSvg(pulse);
  const updatedTime = formatUpdatedTime();
  const nextReadme = updateReadme(readme, stats, updatedTime);

  fs.writeFileSync(config.readmePath, nextReadme);
  writePulseCard(pulseSvg);
  console.log(`README and pulse card updated for ${config.username} at ${updatedTime} (${config.timeZone})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
