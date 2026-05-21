import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultManifestUrl = "https://blogs.anthonytumia.com/blog/posts.json";
const manifestUrl = process.env.BLOG_MANIFEST_URL ?? defaultManifestUrl;
const defaultPostUrls = "https://blogs.anthonytumia.com/blog/stepping-away-from-social-media.md";
const postUrls = process.env.BLOG_POST_URLS;
const baseUrl = process.env.BLOG_R2_BASE_URL ?? "https://blogs.anthonytumia.com/blog/";
const strict = process.env.BLOG_SYNC_STRICT === "1";
const outputDir = path.join(process.cwd(), "content", "blog", "r2");

const posts = await configuredPosts();

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

let synced = 0;

for (const post of posts) {
  const item = typeof post === "string" ? { file: post } : post;
  const source = item.url ?? toUrl(item.file);
  const markdownResponse = await safeFetch(source);

  if (!markdownResponse) {
    continue;
  }

  if (!markdownResponse.ok) {
    const message = `Could not fetch blog post ${source}: ${markdownResponse.status} ${markdownResponse.statusText}`;
    if (strict) {
      throw new Error(message);
    }

    console.warn(`${message}; skipping.`);
    continue;
  }

  const markdown = await markdownResponse.text();
  const filename = path.basename(item.file ?? new URL(source).pathname);
  const slug = filename.replace(/\.md$/i, "");
  const contents = hasFrontMatter(markdown) ? markdown : withFrontMatter(markdown, item, slug);

  await writeFile(path.join(outputDir, `${slug}.md`), contents);
  synced += 1;
}

console.log(`Synced ${synced} R2 blog post${synced === 1 ? "" : "s"}.`);

async function configuredPosts() {
  if (postUrls) {
    return parsePostUrls(postUrls);
  }

  const posts = await postsFromManifest(manifestUrl, { fallback: manifestUrl === defaultManifestUrl });

  if (posts.length > 0) {
    return posts;
  }

  if (manifestUrl === defaultManifestUrl) {
    console.log("No default blog manifest found; falling back to the example post URL.");
    return parsePostUrls(defaultPostUrls);
  }

  return posts;
}

async function postsFromManifest(url, options = {}) {
  const response = await safeFetch(url);

  if (!response) {
    return [];
  }

  if (!response.ok) {
    if (options.fallback && !strict) {
      console.warn(`Could not fetch blog manifest ${url}: ${response.status} ${response.statusText}; falling back.`);
      return [];
    }

    throw new Error(`Could not fetch blog manifest: ${response.status} ${response.statusText}`);
  }

  const manifest = await response.json();
  const posts = Array.isArray(manifest) ? manifest : manifest.posts;

  if (!Array.isArray(posts)) {
    throw new Error("Blog manifest must be an array or an object with a posts array.");
  }

  return posts;
}

async function safeFetch(url) {
  try {
    return await fetch(url);
  } catch (error) {
    const message = `Could not fetch ${url}: ${error.message}`;
    if (strict) {
      throw new Error(message);
    }

    console.warn(`${message}; skipping.`);
    return null;
  }
}

function parsePostUrls(value) {
  if (!value) {
    return [];
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error("BLOG_POST_URLS JSON must be an array.");
    }

    return parsed;
  }

  return trimmed
    .split(/[\n,]+/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function toUrl(file) {
  if (!file) {
    throw new Error("Manifest entries need either a file or url value.");
  }

  if (/^https?:\/\//i.test(file)) {
    return file;
  }

  if (!baseUrl) {
    throw new Error("BLOG_R2_BASE_URL is required when manifest entries use file paths.");
  }

  return new URL(file.replace(/^\/+/, ""), ensureTrailingSlash(baseUrl)).toString();
}

function hasFrontMatter(markdown) {
  return markdown.startsWith("---\n") || markdown.startsWith("---\r\n");
}

function withFrontMatter(markdown, item, slug) {
  const title = item.title ?? firstHeading(markdown) ?? titleFromSlug(slug);
  const date = item.date ?? new Date().toISOString();
  const description = item.description ? `description: ${JSON.stringify(item.description)}\n` : "";
  const body = removeLeadingHeading(markdown, title);

  return `---\ntitle: ${JSON.stringify(title)}\ndate: ${JSON.stringify(date)}\nurl: ${JSON.stringify(`/blog/${slug}/`)}\n${description}---\n\n${body}`;
}

function firstHeading(markdown) {
  const match = markdown.match(/^#{1,6}\s+(.+?)\s*#*\s*$/m);
  return match?.[1]?.trim();
}

function removeLeadingHeading(markdown, title) {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^#{1,6}\\s+${escapedTitle}\\s*#*\\s*(\\r?\\n)+`, "i");
  return markdown.replace(pattern, "");
}

function titleFromSlug(slug) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}
