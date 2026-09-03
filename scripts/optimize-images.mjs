/**
 * One-time asset migration for Draftix.
 *
 * 1. Converts heavy PNGs (map splashes, agent art, root images) to resized WebP.
 * 2. Rewrites /images/**.png paths in public/data/valorant-agents.json to .webp.
 * 3. Verifies every referenced asset exists on disk.
 * 4. Only then deletes the source PNGs.
 *
 * Idempotent: existing .webp files are reused unless --force is passed.
 * Run from the repo root: npm run optimize:images
 */
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const force = process.argv.includes("--force");
const root = process.cwd();
const imagesDir = path.join(root, "public", "images");
const QUALITY = 80;

const MAP_POOL = [
    "ascent", "abyss", "bind", "breeze", "corrode", "fracture",
    "haven", "icebox", "lotus", "pearl", "split", "summit", "sunset",
];

// Resize policy for agent assets by filename.
const AGENT_WIDTHS = {
    "portrait.png": 1024,
    "icon.png": 256,
    "background.png": 1600,
    "role.png": 128,
};
const ABILITY_WIDTH = 128;

// Root-level images to convert: [filename, maxWidth (null = keep size)].
const ROOT_IMAGES = [
    ["draftix.png", 512],
    ["banner-bg.png", 1600],
    ["draftix-tactical-hero.png", null],
    ["footer-image.png", 1400],
    ["button-to-up.png", null],
];

// Landing-page screenshots and key art (referenced by LandingPage.jsx / SeoTopicPage.jsx).
const HOMEPAGE_WIDTH = 1600;

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await walk(full)));
        else if (entry.name.toLowerCase().endsWith(".png")) files.push(full);
    }
    return files;
}

async function convert(file, maxWidth) {
    const output = file.replace(/\.png$/i, ".webp");
    const inSize = (await stat(file)).size;
    if (existsSync(output) && !force) {
        return { file, output, inSize, outSize: (await stat(output)).size, converted: false };
    }
    let image = sharp(file);
    if (maxWidth) image = image.resize({ width: maxWidth, withoutEnlargement: true });
    await image.webp({ quality: QUALITY }).toFile(output);
    const outSize = (await stat(output)).size;
    if (outSize >= inSize) {
        process.stdout.write(`  WARNING: ${path.basename(output)} is not smaller than its PNG source\n`);
    }
    return { file, output, inSize, outSize, converted: true };
}

const results = [];

// 1) Map splashes — full-viewport backgrounds and the 1600x1000 poster canvas.
const mapsDir = path.join(imagesDir, "maps");
for (const file of await walk(mapsDir)) {
    results.push(await convert(file, 1920));
}

// 2) Agent art — recursive (portrait/icon/background/role/abilities).
const agentsDir = path.join(imagesDir, "agents");
for (const file of await walk(agentsDir)) {
    const width = AGENT_WIDTHS[path.basename(file).toLowerCase()] ?? ABILITY_WIDTH;
    results.push(await convert(file, width));
}

// 3) Root images.
for (const [name, width] of ROOT_IMAGES) {
    const file = path.join(imagesDir, name);
    if (existsSync(file)) results.push(await convert(file, width));
}

// 3b) Landing-page Homepage art.
const homepageDir = path.join(imagesDir, "Homepage");
if (existsSync(homepageDir)) {
    for (const file of await walk(homepageDir)) {
        results.push(await convert(file, HOMEPAGE_WIDTH));
    }
}

// 4) Rewrite catalog paths (.png -> .webp for local /images/ URLs only).
const catalogPath = path.join(root, "public", "data", "valorant-agents.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const rewrite = (value) => {
    if (typeof value === "string") {
        return value.startsWith("/images/") && value.endsWith(".png")
            ? value.replace(/\.png$/, ".webp")
            : value;
    }
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
    }
    return value;
};
const rewritten = rewrite(catalog);
await writeFile(catalogPath, `${JSON.stringify(rewritten, null, 2)}\n`, "utf8");

// 5) Verify every referenced asset exists before deleting anything.
const missing = [];
const collect = (value) => {
    if (typeof value === "string" && value.startsWith("/images/")) {
        if (!existsSync(path.join(root, "public", value.slice(1)))) missing.push(value);
    } else if (Array.isArray(value)) {
        value.forEach(collect);
    } else if (value && typeof value === "object") {
        Object.values(value).forEach(collect);
    }
};
collect(rewritten);
for (const map of MAP_POOL) {
    if (!existsSync(path.join(imagesDir, "maps", `${map}.webp`))) missing.push(`/images/maps/${map}.webp`);
}
for (const [name] of ROOT_IMAGES) {
    const webpName = name.replace(/\.png$/, ".webp");
    if (!existsSync(path.join(imagesDir, webpName))) missing.push(`/images/${webpName}`);
}
if (missing.length) {
    console.error(`\nVerification FAILED — ${missing.length} referenced file(s) missing:`);
    for (const url of missing) console.error(`  ${url}`);
    console.error("No PNG sources were deleted. Resolve the mismatches and re-run.");
    process.exit(1);
}

// 6) Delete source PNGs that now have a .webp replacement.
let removed = 0;
for (const result of results) {
    if (existsSync(result.output)) {
        await rm(result.file);
        removed += 1;
    }
}

// 7) Report.
const before = results.reduce((sum, r) => sum + r.inSize, 0);
const after = results.reduce((sum, r) => sum + r.outSize, 0);
const convertedCount = results.filter((r) => r.converted).length;
process.stdout.write(`\nConverted ${convertedCount} file(s); reused ${results.length - convertedCount} existing .webp\n`);
process.stdout.write(`Deleted ${removed} source PNG(s)\n`);
process.stdout.write(`Catalog rewritten: ${path.relative(root, catalogPath)}\n`);
process.stdout.write(`Size: ${kb(before)} -> ${kb(after)} (saved ${kb(before - after)}, ${(((before - after) / before) * 100).toFixed(1)}%)\n`);
