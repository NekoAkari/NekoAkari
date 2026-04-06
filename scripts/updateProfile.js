import fs from "fs";
import path from "path";

/**
 * @typedef {Object} GitHubProfile
 * @property {string} created_at
 * @property {number} public_repos
 * @property {number} followers
 */

/**
 * @typedef {Object} GitHubRepo
 * @property {string} name
 * @property {boolean} fork
 * @property {string | null} language
 * @property {number} stargazers_count
 * @property {string} updated_at
 * @property {string | null} pushed_at
 */

/**
 * @typedef {Object} GitHubEvent
 * @property {string} created_at
 */

/**
 * @typedef {Object} GitHubCommit
 * @property {{ message?: string }} commit
 */

/**
 * @typedef {Object} PulseLanguage
 * @property {string} language
 * @property {number} commits
 */

/**
 * @typedef {Object} PulseRepo
 * @property {string} name
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} ActivitySummary
 * @property {number} activeDays
 * @property {number} eventSampleSize
 * @property {number} peakHour
 * @property {number} peakHourCount
 */

/**
 * @typedef {Object} PulseData
 * @property {string} displayName
 * @property {number} joinedYear
 * @property {number} publicRepos
 * @property {number} followers
 * @property {number} totalCommits
 * @property {number} totalStars
 * @property {PulseLanguage[]} topLanguages
 * @property {PulseRepo[]} recentRepos
 * @property {number} activeDays
 * @property {number} eventSampleSize
 * @property {number} peakHour
 * @property {number} peakHourCount
 * @property {string} lastCommitAt
 */

const APP_CONFIG = {
  username: "NekoAkari",
  timeZone: "America/Vancouver",
  paths: {
    readme: "README.md",
    pulseCard: "assets/github-pulse.svg",
  },
  automatedCommitMessages: new Set(["chore: update profile README"]),
};

const SVG_THEME = {
  languageColors: ["#f4a6b8", "#9fd3c7", "#f6c6a8", "#cdb4db"],
  languageTrack: "#f7efe6",
  repoBullet: "#9fd3c7",
};

const PROFILE_COPY = {
  subtitle: "Student @ SFU · Computing Science",
  pulseDescription: "A custom summary card showing profile stats, languages, recent repositories, and local activity time.",
  fallbackLanguage: { language: "No commit data yet", commits: 1 },
  fallbackRepo: { name: "Still setting things up", updatedAt: new Date().toISOString() },
};

const GITHUB_API_BASE = "https://api.github.com";
const COMMITS_PER_PAGE = 100;

/** @type {Intl.DateTimeFormatOptions} */
const TIMESTAMP_FORMAT_OPTIONS = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
  timeZone: APP_CONFIG.timeZone,
};

/** @type {Intl.DateTimeFormatOptions} */
const MONTH_DAY_FORMAT_OPTIONS = {
  month: "short",
  day: "numeric",
  timeZone: APP_CONFIG.timeZone,
};

/** @type {Intl.DateTimeFormatOptions} */
const FULL_DATE_FORMAT_OPTIONS = {
  ...MONTH_DAY_FORMAT_OPTIONS,
  year: "numeric",
};

/** @type {Intl.DateTimeFormatOptions} */
const DATE_KEY_FORMAT_OPTIONS = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: APP_CONFIG.timeZone,
};

/** @type {Intl.DateTimeFormatOptions} */
const HOUR_FORMAT_OPTIONS = {
  hour: "numeric",
  hour12: false,
  hourCycle: "h23",
  timeZone: APP_CONFIG.timeZone,
};

/** @type {Intl.NumberFormatOptions} */
const COMPACT_NUMBER_FORMAT_OPTIONS = {
  notation: "compact",
  maximumFractionDigits: 1,
};

/**
 * @param {string} locale
 * @param {Intl.DateTimeFormatOptions} options
 * @returns {Intl.DateTimeFormat}
 */
function createDateFormatter(locale, options) {
  return new Intl.DateTimeFormat(locale, options);
}

/**
 * @param {Date} date
 * @returns {string}
 */
function formatUpdatedTime(date = new Date()) {
  const parts = createDateFormatter("en-CA", TIMESTAMP_FORMAT_OPTIONS)
    .formatToParts(date)
    .reduce(
      /** @param {Record<string, string>} result @param {Intl.DateTimeFormatPart} part
       * @param part
       */
      (result, part) => {
        if (part.type !== "literal") {
          result[part.type] = part.value;
        }
        return result;
      },
      /** @type {Record<string, string>} */ ({})
    );

  return `${parts.year}-${parts.month}-${parts.day}, ${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatCompactNumber(value) {
  return new Intl.NumberFormat("en", COMPACT_NUMBER_FORMAT_OPTIONS).format(value);
}

/**
 * @param {string} dateString
 * @returns {string}
 */
function formatMonthDay(dateString) {
  return createDateFormatter("en-US", MONTH_DAY_FORMAT_OPTIONS).format(new Date(dateString));
}

/**
 * @param {string} dateString
 * @returns {string}
 */
function formatFullDate(dateString) {
  return createDateFormatter("en-US", FULL_DATE_FORMAT_OPTIONS).format(new Date(dateString));
}

/**
 * @param {string} dateString
 * @returns {string}
 */
function getLocalDateKey(dateString) {
  return createDateFormatter("en-CA", DATE_KEY_FORMAT_OPTIONS).format(new Date(dateString));
}

/**
 * @param {string} dateString
 * @returns {number}
 */
function getLocalHour(dateString) {
  const hour = Number(createDateFormatter("en-US", HOUR_FORMAT_OPTIONS).format(new Date(dateString)));
  return Number.isNaN(hour) || hour === 24 ? 0 : hour;
}

/**
 * @returns {Record<string, string>}
 */
function getRequestHeaders() {
  /** @type {Record<string, string>} */
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": `${APP_CONFIG.username}-profile-readme-updater`,
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

/**
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function fetchResponse(url) {
  const response = await fetch(url, { headers: getRequestHeaders() });

  if (!response.ok) {
    throw new Error(`GitHub API request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response;
}

/**
 * @template T
 * @param {string} url
 * @returns {Promise<T>}
 */
async function fetchJson(url) {
  const response = await fetchResponse(url);
  return response.json();
}

/**
 * @returns {Promise<GitHubProfile>}
 */
function fetchGitHubProfile() {
  return fetchJson(`${GITHUB_API_BASE}/users/${APP_CONFIG.username}`);
}

/**
 * @returns {Promise<GitHubRepo[]>}
 */
function fetchRepositories() {
  return fetchJson(`${GITHUB_API_BASE}/users/${APP_CONFIG.username}/repos?per_page=100&sort=updated`);
}

/**
 * @returns {Promise<GitHubEvent[]>}
 */
function fetchPublicEvents() {
  return fetchJson(`${GITHUB_API_BASE}/users/${APP_CONFIG.username}/events/public?per_page=100`);
}

/**
 * @param {string} repoName
 * @param {number} page
 * @returns {Promise<GitHubCommit[]>}
 */
async function fetchCommitPage(repoName, page) {
  const url = new URL(`${GITHUB_API_BASE}/repos/${APP_CONFIG.username}/${repoName}/commits`);
  url.searchParams.set("author", APP_CONFIG.username);
  url.searchParams.set("per_page", String(COMMITS_PER_PAGE));
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString(), { headers: getRequestHeaders() });

  if (response.status === 409) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`GitHub API request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * @param {GitHubCommit} commit
 * @returns {boolean}
 */
function isManualCommit(commit) {
  const summary = commit.commit?.message?.split("\n")[0] ?? "";
  return !APP_CONFIG.automatedCommitMessages.has(summary);
}

/**
 * @param {string} repoName
 * @returns {Promise<number>}
 */
async function fetchManualCommitCount(repoName) {
  let totalCommits = 0;

  for (let page = 1; ; page += 1) {
    const commits = await fetchCommitPage(repoName, page);
    if (commits.length === 0) {
      break;
    }

    totalCommits += commits.filter(isManualCommit).length;

    if (commits.length < COMMITS_PER_PAGE) {
      break;
    }
  }

  return totalCommits;
}

/**
 * @param {GitHubRepo[]} repos
 * @returns {GitHubRepo[]}
 */
function getSourceRepos(repos) {
  return repos.filter((repo) => !repo.fork);
}

/**
 * @param {GitHubRepo[]} repos
 * @returns {Promise<Map<string, number>>}
 */
async function fetchCommitCountsByLanguage(repos) {
  const sourceReposWithLanguage = getSourceRepos(repos).filter((repo) => repo.language);
  const commitEntries = await Promise.all(
    sourceReposWithLanguage.map(async (repo) => ({
      language: repo.language,
      commits: await fetchManualCommitCount(repo.name),
    }))
  );

  /** @type {Map<string, number>} */
  const countsByLanguage = new Map();
  for (const entry of commitEntries) {
    if (!entry.language || entry.commits <= 0) {
      continue;
    }

    countsByLanguage.set(entry.language, (countsByLanguage.get(entry.language) ?? 0) + entry.commits);
  }

  return countsByLanguage;
}

/**
 * @param {GitHubRepo[]} repos
 * @returns {PulseRepo[]}
 */
function getRecentRepos(repos) {
  return getSourceRepos(repos)
    .slice()
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, 3)
    .map((repo) => ({
      name: repo.name,
      updatedAt: repo.updated_at,
    }));
}

/**
 * @param {GitHubRepo[]} repos
 * @returns {string}
 */
function getLastCommitLabel(repos) {
  const lastCommitAt = getSourceRepos(repos)
    .map((repo) => repo.pushed_at)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];

  return lastCommitAt ? formatFullDate(lastCommitAt) : "No commits yet";
}

/**
 * @param {Map<string, number>} commitCountsByLanguage
 * @returns {PulseLanguage[]}
 */
function getTopLanguages(commitCountsByLanguage) {
  return [...commitCountsByLanguage.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([language, commits]) => ({ language, commits }));
}

/**
 * @param {GitHubEvent[]} events
 * @returns {ActivitySummary}
 */
function summarizeActivity(events) {
  const hourCounts = Array.from({ length: 24 }, () => 0);
  for (const event of events) {
    hourCounts[getLocalHour(event.created_at)] += 1;
  }

  const peakHourCount = Math.max(...hourCounts, 0);

  return {
    activeDays: new Set(events.map((event) => getLocalDateKey(event.created_at))).size,
    eventSampleSize: events.length,
    peakHour: hourCounts.indexOf(peakHourCount),
    peakHourCount,
  };
}

/**
 * @param {Map<string, number>} commitCountsByLanguage
 * @returns {number}
 */
function sumCommitCounts(commitCountsByLanguage) {
  return [...commitCountsByLanguage.values()].reduce((sum, count) => sum + count, 0);
}

/**
 * @param {GitHubRepo[]} repos
 * @returns {number}
 */
function sumStars(repos) {
  return getSourceRepos(repos).reduce((sum, repo) => sum + repo.stargazers_count, 0);
}

/**
 * @param {GitHubProfile} profile
 * @param {GitHubRepo[]} repos
 * @param {GitHubEvent[]} events
 * @param {Map<string, number>} commitCountsByLanguage
 * @returns {PulseData}
 */
function buildPulseData(profile, repos, events, commitCountsByLanguage) {
  const activity = summarizeActivity(events);

  return {
    displayName: APP_CONFIG.username,
    joinedYear: new Date(profile.created_at).getFullYear(),
    publicRepos: profile.public_repos,
    followers: profile.followers,
    totalCommits: sumCommitCounts(commitCountsByLanguage),
    totalStars: sumStars(repos),
    topLanguages: getTopLanguages(commitCountsByLanguage),
    recentRepos: getRecentRepos(repos),
    activeDays: activity.activeDays,
    eventSampleSize: activity.eventSampleSize,
    peakHour: activity.peakHour,
    peakHourCount: activity.peakHourCount,
    lastCommitAt: getLastCommitLabel(repos),
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * @param {PulseLanguage[]} languages
 * @returns {string}
 */
function renderLanguageBars(languages) {
  const maxCommitCount = Math.max(...languages.map((item) => item.commits), 1);

  return languages
    .map((item, index) => {
      const y = 286 + index * 50;
      const width = Math.round((item.commits / maxCommitCount) * 140);

      return `
        <text x="78" y="${y}" class="label">${escapeXml(item.language)}</text>
        <rect x="224" y="${y - 16}" width="146" height="18" rx="9" fill="${SVG_THEME.languageTrack}" />
        <rect x="224" y="${y - 16}" width="${width}" height="18" rx="9" fill="${SVG_THEME.languageColors[index % SVG_THEME.languageColors.length]}" />
        <text x="460" y="${y}" class="stat-muted" text-anchor="end">${item.commits} commit${item.commits === 1 ? "" : "s"}</text>
      `;
    })
    .join("");
}

/**
 * @param {PulseRepo[]} repos
 * @returns {string}
 */
function renderRecentRepos(repos) {
  return repos
    .map((repo, index) => {
      const y = 420 + index * 30;
      return `
        <circle cx="548" cy="${y - 6}" r="4" fill="${SVG_THEME.repoBullet}" />
        <text x="564" y="${y}" class="label">${escapeXml(repo.name)}</text>
        <text x="866" y="${y}" class="stat-muted" text-anchor="end">updated ${formatMonthDay(repo.updatedAt)}</text>
      `;
    })
    .join("");
}

/**
 * @param {PulseData} pulse
 * @returns {string}
 */
function renderPulseCard(pulse) {
  const languages = pulse.topLanguages.length > 0 ? pulse.topLanguages : [PROFILE_COPY.fallbackLanguage];
  const repos = pulse.recentRepos.length > 0 ? pulse.recentRepos : [PROFILE_COPY.fallbackRepo];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="960" height="620" viewBox="0 0 960 620" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Custom GitHub Pulse card for ${escapeXml(APP_CONFIG.username)}</title>
  <desc id="desc">${PROFILE_COPY.pulseDescription}</desc>
  <defs>
    <linearGradient id="bg" x1="40" y1="30" x2="860" y2="430" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFF8F6" />
      <stop offset="1" stop-color="#F6FBFF" />
    </linearGradient>
    <linearGradient id="header" x1="56" y1="56" x2="844" y2="160" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFE2EA" />
      <stop offset="1" stop-color="#DFF7F1" />
    </linearGradient>
    <filter id="shadow" x="0" y="0" width="960" height="620" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#E9D8E0" flood-opacity="0.45" />
    </filter>
  </defs>

  <style>
    .title { font: 700 34px "Avenir Next", "Segoe UI", sans-serif; fill: #2f3142; }
    .subtitle { font: 500 16px "Avenir Next", "Segoe UI", sans-serif; fill: #5f6884; }
    .section { font: 700 14px "Avenir Next", "Segoe UI", sans-serif; fill: #58627f; letter-spacing: 0.12em; text-transform: uppercase; }
    .metric { font: 700 30px "Avenir Next", "Segoe UI", sans-serif; fill: #2f3142; }
    .metric-label { font: 500 13px "Avenir Next", "Segoe UI", sans-serif; fill: #6e7692; }
    .label { font: 600 17px "Avenir Next", "Segoe UI", sans-serif; fill: #364057; }
    .body { font: 500 14px "Avenir Next", "Segoe UI", sans-serif; fill: #4f5874; }
    .stat-muted { font: 500 13px "Avenir Next", "Segoe UI", sans-serif; fill: #7e88a6; }
    .small { font: 500 12px "Avenir Next", "Segoe UI", sans-serif; fill: #8b94af; }
  </style>

  <g filter="url(#shadow)">
    <rect x="24" y="24" width="912" height="560" rx="34" fill="url(#bg)" />
    <rect x="24.75" y="24.75" width="910.5" height="558.5" rx="33.25" stroke="#F2DDE4" stroke-opacity="0.9" stroke-width="1.5" />
  </g>

  <rect x="54" y="56" width="852" height="126" rx="28" fill="url(#header)" />
  <text x="84" y="110" class="title">${escapeXml(pulse.displayName)}</text>
  <text x="84" y="139" class="subtitle">${PROFILE_COPY.subtitle}</text>
  <text x="84" y="165" class="small">Joined GitHub in ${pulse.joinedYear} • Last commit: ${pulse.lastCommitAt}</text>

  <rect x="54" y="210" width="430" height="310" rx="26" fill="#FFFFFF" fill-opacity="0.88" stroke="#F4E5EA" />
  <text x="78" y="246" class="section">Top Languages by Commit</text>
  ${renderLanguageBars(languages)}

  <rect x="502" y="210" width="388" height="310" rx="26" fill="#FFFFFF" fill-opacity="0.88" stroke="#E5EFF0" />
  <text x="528" y="246" class="section">Recent Rhythm</text>
  <text x="528" y="272" class="body">Recent public activity sample</text>
  <text x="528" y="294" class="body">${pulse.eventSampleSize} events across ${pulse.activeDays} active day${pulse.activeDays === 1 ? "" : "s"}</text>
  <text x="528" y="324" class="body">Most active hour in Vancouver</text>
  <text x="528" y="346" class="body">${String(pulse.peakHour).padStart(2, "0")}:00 with ${pulse.peakHourCount} event${pulse.peakHourCount === 1 ? "" : "s"}</text>
  <text x="528" y="388" class="section">Recently Touched Repos</text>
  ${renderRecentRepos(repos)}

  <g transform="translate(500 78)">
    <rect x="0" y="0" width="84" height="86" rx="22" fill="#FFFFFF" fill-opacity="0.82" />
    <text x="42" y="38" text-anchor="middle" class="metric">${formatCompactNumber(pulse.publicRepos)}</text>
    <text x="42" y="64" text-anchor="middle" class="metric-label">repos</text>
  </g>
  <g transform="translate(598 78)">
    <rect x="0" y="0" width="84" height="86" rx="22" fill="#FFFFFF" fill-opacity="0.82" />
    <text x="42" y="38" text-anchor="middle" class="metric">${formatCompactNumber(pulse.totalCommits)}</text>
    <text x="42" y="64" text-anchor="middle" class="metric-label">commits</text>
  </g>
  <g transform="translate(696 78)">
    <rect x="0" y="0" width="84" height="86" rx="22" fill="#FFFFFF" fill-opacity="0.82" />
    <text x="42" y="38" text-anchor="middle" class="metric">${formatCompactNumber(pulse.followers)}</text>
    <text x="42" y="64" text-anchor="middle" class="metric-label">followers</text>
  </g>
  <g transform="translate(794 78)">
    <rect x="0" y="0" width="84" height="86" rx="22" fill="#FFFFFF" fill-opacity="0.82" />
    <text x="42" y="38" text-anchor="middle" class="metric">${formatCompactNumber(pulse.totalStars)}</text>
    <text x="42" y="64" text-anchor="middle" class="metric-label">stars</text>
  </g>
</svg>`;
}

/**
 * @param {string} readme
 * @param {string} updatedTime
 * @returns {string}
 */
function updateReadmeTimestamp(readme, updatedTime) {
  return readme.replace(
    /<!-- LAST_UPDATED:START -->[\s\S]*?<!-- LAST_UPDATED:END -->/,
    `<!-- LAST_UPDATED:START -->\nLast updated: ${updatedTime} (Vancouver time)\n<!-- LAST_UPDATED:END -->`
  );
}

/**
 * @param {string} filePath
 * @param {string} content
 */
function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

/** @returns {Promise<void>} */
async function main() {
  /** @type {[GitHubProfile, GitHubRepo[], GitHubEvent[]]} */
  const [profile, repos, events] = await Promise.all([
    fetchGitHubProfile(),
    fetchRepositories(),
    fetchPublicEvents(),
  ]);

  const commitCountsByLanguage = await fetchCommitCountsByLanguage(repos);
  const pulseData = buildPulseData(profile, repos, events, commitCountsByLanguage);
  const updatedTime = formatUpdatedTime();
  const readme = fs.readFileSync(APP_CONFIG.paths.readme, "utf8");

  writeFile(APP_CONFIG.paths.readme, updateReadmeTimestamp(readme, updatedTime));
  writeFile(APP_CONFIG.paths.pulseCard, renderPulseCard(pulseData));

  console.log(`README and pulse card updated for ${APP_CONFIG.username} at ${updatedTime} (${APP_CONFIG.timeZone})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
