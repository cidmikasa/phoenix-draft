
const fs = require("fs");
const path = require("path");

const API_URL =
  "https://raw.githubusercontent.com/vin-03/web-scraper-mlbb-heroInfo/main/data/heroes.json";

const ROOT_DIR = path.join(__dirname, "..");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");
const IMAGES_DIR = path.join(ASSETS_DIR, "images");
const HEROES_FILE = path.join(ASSETS_DIR, "heroes.json");
const CURRENT_HEROES_FILE = path.join(
  ASSETS_DIR,
  "current-heroes.json"
);

const REFRESH_IMAGES = process.argv.includes("--refresh-images");

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractUrl(value) {
  if (typeof value !== "string") return null;

  const markdownMatch = value.match(
    /\]\((https?:\/\/[^)]+)\)/
  );

  if (markdownMatch) return markdownMatch[1];

  if (/^https?:\/\//i.test(value)) return value;

  return null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isValidImage(buffer, contentType = "") {
  if (!buffer || buffer.length < 8) return false;

  const isPng =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const isWebp =
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  const isGif =
    buffer.toString("ascii", 0, 3) === "GIF";

  return (
    isPng ||
    isJpeg ||
    isWebp ||
    isGif ||
    /^image\//i.test(contentType)
  );
}

async function downloadImage(url, destination) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";

  if (!isValidImage(buffer, contentType)) {
    throw new Error("Response was not a valid image");
  }

  // Write to a temporary file first so a failed download
  // cannot partially overwrite the existing image.
  const temporaryFile = `${destination}.download`;

  try {
    fs.writeFileSync(temporaryFile, buffer);
    fs.renameSync(temporaryFile, destination);
  } finally {
    if (fs.existsSync(temporaryFile)) {
      fs.unlinkSync(temporaryFile);
    }
  }
}

function existingImage(relativePath) {
  if (!relativePath) return false;

  const fullPath = path.resolve(ASSETS_DIR, relativePath);
  const relativeToAssets = path.relative(ASSETS_DIR, fullPath);

  if (
    relativeToAssets.startsWith("..") ||
    path.isAbsolute(relativeToAssets)
  ) {
    return false;
  }

  return fs.existsSync(fullPath) &&
    fs.statSync(fullPath).isFile();
}

async function syncHeroes() {
  console.log("Phoenix Draft — Full Hero Sync");
  console.log("--------------------------------");
  console.log(
    REFRESH_IMAGES
      ? "Image mode: refresh existing source images"
      : "Image mode: download missing source images"
  );

  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // Read and validate supplemental records.
  const currentData = readJson(CURRENT_HEROES_FILE);
  const currentHeroes = currentData.heroes;

  if (!Array.isArray(currentHeroes)) {
    throw new Error(
      "current-heroes.json must contain a heroes array."
    );
  }

  // Read the existing database. Do not silently replace
  // an unreadable database with default statuses.
  const existingData = readJson(HEROES_FILE);

  if (!Array.isArray(existingData.heroes)) {
    throw new Error("heroes.json has no valid heroes array.");
  }

  const existingHeroes = existingData.heroes;
  const existingById = new Map(
    existingHeroes.map(hero => [hero.id, hero])
  );

  const statusById = new Map(
    existingHeroes.map(hero => [hero.id, hero.status])
  );

  console.log("Fetching source roster...");

  const response = await fetch(API_URL, {
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`Hero source returned HTTP ${response.status}`);
  }

  const sourceHeroes = await response.json();

  if (!Array.isArray(sourceHeroes) || sourceHeroes.length === 0) {
    throw new Error("Source returned an empty or invalid roster.");
  }

  // Reject malformed or duplicate source IDs.
  const sourceIds = new Set();

  for (const hero of sourceHeroes) {
    if (
      !Number.isInteger(hero.id) ||
      typeof hero.name !== "string" ||
      !hero.name.trim()
    ) {
      throw new Error("Source contains a hero with invalid ID/name.");
    }

    if (sourceIds.has(hero.id)) {
      throw new Error(`Duplicate source hero ID: ${hero.id}`);
    }

    sourceIds.add(hero.id);
  }

  console.log(`Source heroes: ${sourceHeroes.length}`);
  console.log(`Supplemental heroes: ${currentHeroes.length}`);

  // Supplemental records override matching fields but do not
  // erase source fields that are absent from a patch.
  const heroMap = new Map(
    sourceHeroes.map(hero => [hero.id, { ...hero }])
  );

  for (const patch of currentHeroes) {
    if (
      !Number.isInteger(patch.id) ||
      typeof patch.name !== "string" ||
      !patch.name.trim()
    ) {
      throw new Error("Supplemental data contains an invalid hero.");
    }

    const previous = heroMap.get(patch.id) || {};
    heroMap.set(patch.id, { ...previous, ...patch });
  }

  const mergedHeroes = [...heroMap.values()].sort(
    (a, b) => a.id - b.id
  );

  const outputHeroes = [];
  const warnings = [];

  for (const hero of mergedHeroes) {
    const id = hero.id;
    const name = hero.name;
    const slug = hero.slug || slugify(name);

    const roundFilename = `${id}-${slug}-round.png`;
    const rectangleFilename = `${id}-${slug}.png`;

    const roundPath = path.join(IMAGES_DIR, roundFilename);
    const rectanglePath = path.join(IMAGES_DIR, rectangleFilename);

    const roundUrl = extractUrl(hero.icons?.round);
    const rectangleUrl = extractUrl(hero.icons?.rectangle);

    console.log(`Processing ${name} (ID ${id})`);

    async function ensureImage(url, destination, label) {
      const exists = fs.existsSync(destination);

      if (!url) {
        if (exists) return true;
        return false;
      }

      if (exists && !REFRESH_IMAGES) return true;

      try {
        console.log(`  Downloading ${label}...`);
        await downloadImage(url, destination);
        return true;
      } catch (error) {
        warnings.push(
          `${name}: ${label} download failed (${error.message})`
        );

        if (exists) {
          console.log(`  Keeping existing ${label}.`);
          return true;
        }

        return false;
      }
    }

    const hasRound = await ensureImage(
      roundUrl,
      roundPath,
      "round image"
    );

    let hasRectangle = await ensureImage(
      rectangleUrl,
      rectanglePath,
      "rectangle image"
    );

    // Supplemental heroes currently have round portraits only.
    // Use the existing round portrait as a safe temporary fallback.
    let rectangleRelativePath = `./images/${rectangleFilename}`;

    if (!hasRectangle && hasRound) {
      rectangleRelativePath = `./images/${roundFilename}`;
      console.log("  Using round portrait as rectangle fallback.");
    } else if (!hasRectangle) {
      throw new Error(
        `No usable round or rectangle image for ${name} (ID ${id}).`
      );
    }

    if (!hasRound) {
      throw new Error(
        `Missing round image for ${name} (ID ${id}).`
      );
    }

    const roles = Array.isArray(hero.roles)
      ? hero.roles
      : Array.isArray(hero.role)
        ? hero.role
        : [];

    const lanes = Array.isArray(hero.lanes)
      ? hero.lanes
      : Array.isArray(hero.lane)
        ? hero.lane
        : [];

    const previous = existingById.get(id);

    outputHeroes.push({
      id,
      name,
      slug,
      roles,
      lanes,
      images: {
        round: `./images/${roundFilename}`,
        rectangle: rectangleRelativePath
      },
      status:
        statusById.get(id) ??
        hero.status ??
        "locked"
    });
  }

  // Validate the complete database before writing anything.
  const outputIds = new Set();

  for (const hero of outputHeroes) {
    if (outputIds.has(hero.id)) {
      throw new Error(`Duplicate merged hero ID: ${hero.id}`);
    }

    outputIds.add(hero.id);

    for (const type of ["round", "rectangle"]) {
      if (!existingImage(hero.images[type])) {
        throw new Error(
          `Validation failed: ${hero.name} has a missing ${type} image.`
        );
      }
    }
  }

  if (outputHeroes.length < sourceHeroes.length) {
    throw new Error("Merged roster unexpectedly lost source heroes.");
  }

  const output = {
    version: existingData.version || 1,
    lastUpdated: new Date().toISOString(),
    heroCount: outputHeroes.length,
    heroes: outputHeroes
  };

  // Build and parse the JSON before publishing.
  const json = JSON.stringify(output, null, 2);
  JSON.parse(json);

  const temporaryJson = `${HEROES_FILE}.tmp`;
  fs.writeFileSync(temporaryJson, json, "utf8");

  try {
    // Publish only after all data and image checks pass.
    fs.copyFileSync(temporaryJson, HEROES_FILE);
  } finally {
    if (fs.existsSync(temporaryJson)) {
      fs.unlinkSync(temporaryJson);
    }
  }

  console.log("");
  console.log("--------------------------------");
  console.log("HERO SYNC COMPLETE");
  console.log(`Source heroes: ${sourceHeroes.length}`);
  console.log(`Supplemental heroes: ${currentHeroes.length}`);
  console.log(`Heroes saved: ${outputHeroes.length}`);
  console.log(`Database: ${HEROES_FILE}`);
  console.log(`Images: ${IMAGES_DIR}`);

  if (warnings.length) {
    console.log("");
    console.log("Image warnings:");

    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log("--------------------------------");
}

syncHeroes().catch(error => {
  console.error("");
  console.error("HERO SYNC FAILED");
  console.error(error.message);
  process.exitCode = 1;
});
