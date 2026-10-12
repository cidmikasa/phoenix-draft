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

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function extractUrl(value) {
    if (!value) return null;

    // The source may provide URLs as Markdown links.
    const markdownMatch = value.match(/\]\((https?:\/\/[^)]+)\)/);

    if (markdownMatch) {
        return markdownMatch[1];
    }

    // Or as normal URLs.
    if (
        value.startsWith("http://") ||
        value.startsWith("https://")
    ) {
        return value;
    }

    return null;
}

async function downloadImage(url, destination) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    fs.writeFileSync(destination, buffer);
}

// --------------------------------------------------
// Main sync
// --------------------------------------------------

async function syncHeroes() {
    console.log("🔥 Phoenix Draft Hero Sync");
    console.log("--------------------------------");

    fs.mkdirSync(IMAGES_DIR, { recursive: true });

    console.log("Fetching hero data...");

    const response = await fetch(API_URL);

    if (!response.ok) {
        throw new Error(`Hero API returned HTTP ${response.status}`);
    }

    const sourceHeroes = await response.json();

    // --------------------------------------------------
// Load current hero patch
// --------------------------------------------------

let currentHeroes = [];

if (fs.existsSync(CURRENT_HEROES_FILE)) {
    const currentData = JSON.parse(
        fs.readFileSync(CURRENT_HEROES_FILE, "utf8")
    );

    currentHeroes = currentData.heroes || [];
}

console.log(
    `Current hero patch: ${currentHeroes.length} heroes`
);

    console.log(`Received ${sourceHeroes.length} heroes.`);
    console.log("");

    // --------------------------------------------------
    // Check newest heroes
    // --------------------------------------------------

    const expectedRecentHeroes = [
        { id: 130, name: "Obsidia" },
        { id: 131, name: "Sora" },
        { id: 132, name: "Marcel" },
        { id: 133, name: "Hirara" }
    ];

    console.log("Checking latest heroes...");

    for (const expected of expectedRecentHeroes) {
        const found = sourceHeroes.find(
            hero => hero.id === expected.id
        );

        if (found) {
            console.log(
                `  ✅ ${expected.id} - ${expected.name}`
            );
        } else {
            console.log(
                `  ❌ ${expected.id} - ${expected.name} MISSING`
            );
        }
    }

    console.log("");

    // --------------------------------------------------
    // Load existing heroes.json
    // --------------------------------------------------

    let existingHeroes = [];

    if (fs.existsSync(HEROES_FILE)) {
        try {
            const existingData = JSON.parse(
                fs.readFileSync(HEROES_FILE, "utf8")
            );

            existingHeroes = existingData.heroes || [];
        } catch {
            console.log(
                "Existing heroes.json could not be read."
            );

            console.log("Creating a fresh database.");
        }
    }

    // Preserve existing hero status
    const existingStatus = new Map(
        existingHeroes.map(hero => [
            hero.id,
            hero.status
        ])
    );

// --------------------------------------------------
// Merge base heroes + current heroes
// --------------------------------------------------

const heroMap = new Map(
    sourceHeroes.map(hero => [hero.id, hero])
);

for (const hero of currentHeroes) {
    heroMap.set(hero.id, hero);
}

const mergedHeroes = Array.from(heroMap.values());

console.log(
    `Merged hero count: ${mergedHeroes.length}`
);

    const heroes = [];

    // --------------------------------------------------
    // Process heroes
    // --------------------------------------------------

    for (const hero of mergedHeroes) {
        const id = hero.id;
        const name = hero.name;
        const slug = slugify(name);

        const roundUrl = extractUrl(
            hero.icons?.round
        );

        const rectangleUrl = extractUrl(
            hero.icons?.rectangle
        );

        console.log(
            `Processing: ${name} (ID ${id})`
        );

        const roundFilename =
            `${id}-${slug}-round.png`;

        const rectangleFilename =
            `${id}-${slug}.png`;

        const roundPath =
            path.join(
                IMAGES_DIR,
                roundFilename
            );

        const rectanglePath =
            path.join(
                IMAGES_DIR,
                rectangleFilename
            );

        // --------------------------------------------------
        // Download round image
        // --------------------------------------------------

        if (
            roundUrl &&
            !fs.existsSync(roundPath)
        ) {
            try {
                console.log(
                    "  ↓ Downloading round image..."
                );

                await downloadImage(
                    roundUrl,
                    roundPath
                );
            } catch (error) {
                console.log(
                    `  ⚠ Round image failed: ${error.message}`
                );
            }
        }

        // --------------------------------------------------
        // Download rectangle image
        // --------------------------------------------------

        if (
            rectangleUrl &&
            !fs.existsSync(rectanglePath)
        ) {
            try {
                console.log(
                    "  ↓ Downloading rectangle image..."
                );

                await downloadImage(
                    rectangleUrl,
                    rectanglePath
                );
            } catch (error) {
                console.log(
                    `  ⚠ Rectangle image failed: ${error.message}`
                );
            }
        }

        // --------------------------------------------------
        // Build Phoenix hero object
        // --------------------------------------------------

        const heroData = {
            id: id,
            name: name,
            slug: slug,

            roles: hero.role || [],
            lanes: hero.lane || [],

            images: {
                round: `./images/${roundFilename}`,
                rectangle: `./images/${rectangleFilename}`
            },

            status:
                existingStatus.get(id) ||
                "locked"
        };

        heroes.push(heroData);
    }

    // --------------------------------------------------
    // Create heroes.json
    // --------------------------------------------------

    const output = {
        version: 1,
        lastUpdated: new Date().toISOString(),
        heroCount: heroes.length,
        heroes: heroes
    };

    fs.writeFileSync(
        HEROES_FILE,
        JSON.stringify(
            output,
            null,
            2
        ),
        "utf8"
    );

    console.log("");
    console.log("--------------------------------");
    console.log("🔥 HERO SYNC COMPLETE!");
    console.log(
        `Heroes saved: ${heroes.length}`
    );
    console.log(
        `Database: ${HEROES_FILE}`
    );
    console.log(
        `Images: ${IMAGES_DIR}`
    );
    console.log("--------------------------------");
}

// --------------------------------------------------
// Start
// --------------------------------------------------

syncHeroes().catch(error => {
    console.error("");
    console.error("❌ HERO SYNC FAILED");
    console.error(error);
    process.exit(1);
});