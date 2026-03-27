import fs from 'fs';

const username = "NekoAkari";

async function main() {
    const res = await fetch(`https://api.github.com/users/${username}`);
    const data = await res.json();

    const content = `
- 👤 User: ${data.login}
- 📦 Public Repos: ${data.public_repos}
- 👥 Followers: ${data.followers}
- 🔁 Following: ${data.following}
`;

    fs.writeFileSync("stats.md", content);
}

main();
