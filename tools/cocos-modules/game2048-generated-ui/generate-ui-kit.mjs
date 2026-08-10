#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const BACKGROUND_WIDTH = 800;
const BACKGROUND_HEIGHT = 1920;
const SAFE_FRAME_HEIGHT = 1420;
const SAFE_FRAME_TOP = Math.round((BACKGROUND_HEIGHT - SAFE_FRAME_HEIGHT) / 2);
const FINAL_PNG_OPTIONS = {
    compressionLevel: 9,
    adaptiveFiltering: true,
    palette: true,
    quality: 92,
    colors: 256,
    effort: 10,
    dither: 0.85,
};

const THEMES = {
    "2048": {
        name: "2048 竞技场",
        fill: "#0B1931",
        fillSoft: "#162B4C",
        fillRaised: "#20395B",
        primaryTop: "#70DAE4",
        primaryBottom: "#2A9DBF",
        secondaryTop: "#526B94",
        secondaryBottom: "#2A3F64",
        dangerTop: "#FF8B79",
        dangerBottom: "#D84E62",
        border: "#70DAE4",
        borderSoft: "#2A9DBF",
        textHint: "#E4F4FF",
        overlay: "rgba(2,8,23,0.82)",
        motif: "circuit",
    },
    puzzle: {
        name: "光影拼图",
        fill: "#FFF8E2",
        fillSoft: "#F6EEDA",
        fillRaised: "#F2DFBC",
        primaryTop: "#E2B35F",
        primaryBottom: "#B97832",
        secondaryTop: "#75927A",
        secondaryBottom: "#4E7059",
        dangerTop: "#D97762",
        dangerBottom: "#A94B43",
        border: "#D8A752",
        borderSoft: "#9A7044",
        textHint: "#5F4731",
        overlay: "rgba(73,52,38,0.72)",
        motif: "paper",
    },
    trace: {
        name: "轨迹拾光",
        fill: "#141C3E",
        fillSoft: "#1E2C56",
        fillRaised: "#273F70",
        primaryTop: "#7CEBFF",
        primaryBottom: "#37ADE0",
        secondaryTop: "#576AA8",
        secondaryBottom: "#293C77",
        dangerTop: "#FF8196",
        dangerBottom: "#D84968",
        border: "#8DEBFF",
        borderSoft: "#5CBEE8",
        textHint: "#E9FBFF",
        overlay: "rgba(7,10,30,0.82)",
        motif: "starlight",
    },
};

function parseArgs(argv) {
    const values = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        values.set(argv[index], argv[index + 1]);
    }
    const theme = values.get("--theme");
    const background = values.get("--background");
    const out = values.get("--out");
    if (!theme || !THEMES[theme] || !background || !out) {
        throw new Error(
            "Usage: generate-ui-kit.mjs --theme <2048|puzzle|trace> --background <png> --out <dir>",
        );
    }
    return { theme, background, out };
}

function escapeXml(value) {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function svg(width, height, body, defs = "") {
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${body}</svg>`,
    );
}

function gradient(id, top, bottom) {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${escapeXml(top)}"/><stop offset="1" stop-color="${escapeXml(bottom)}"/></linearGradient>`;
}

function cornerMotif(theme, width, height, inset) {
    if (theme.motif === "paper") {
        return `<path d="M${inset} ${inset + 24}V${inset}H${inset + 24}M${width - inset - 24} ${inset}H${width - inset}V${inset + 24}M${inset} ${height - inset - 24}V${height - inset}H${inset + 24}M${width - inset - 24} ${height - inset}H${width - inset}V${height - inset - 24}" fill="none" stroke="${theme.border}" stroke-width="3" stroke-linecap="round" opacity=".72"/>`;
    }
    if (theme.motif === "starlight") {
        return `<g fill="${theme.border}" opacity=".82"><circle cx="${inset + 8}" cy="${inset + 8}" r="3"/><circle cx="${width - inset - 8}" cy="${inset + 8}" r="2"/><circle cx="${inset + 8}" cy="${height - inset - 8}" r="2"/><circle cx="${width - inset - 8}" cy="${height - inset - 8}" r="3"/></g>`;
    }
    return `<path d="M${inset} ${inset + 20}V${inset}H${inset + 20}M${width - inset - 20} ${inset}H${width - inset}V${inset + 20}M${inset} ${height - inset - 20}V${height - inset}H${inset + 20}M${width - inset - 20} ${height - inset}H${width - inset}V${height - inset - 20}" fill="none" stroke="${theme.border}" stroke-width="3" opacity=".78"/><g fill="${theme.border}"><circle cx="${inset}" cy="${inset}" r="3"/><circle cx="${width - inset}" cy="${inset}" r="3"/><circle cx="${inset}" cy="${height - inset}" r="3"/><circle cx="${width - inset}" cy="${height - inset}" r="3"/></g>`;
}

function surfaceSvg(theme, width, height, radius, options = {}) {
    const {
        top = theme.fillSoft,
        bottom = theme.fill,
        border = theme.borderSoft,
        borderWidth = 3,
        motif = true,
        shadow = false,
    } = options;
    const inset = shadow ? 8 : 4;
    const shadowMarkup = shadow
        ? `<rect x="8" y="10" width="${width - 16}" height="${height - 18}" rx="${Math.max(2, radius - 5)}" fill="#000" opacity=".24"/>`
        : "";
    return svg(
        width,
        height,
        `${shadowMarkup}<rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="${radius}" fill="url(#surface)" stroke="${border}" stroke-width="${borderWidth}"/>${motif ? cornerMotif(theme, width, height, inset + 8) : ""}`,
        gradient("surface", top, bottom),
    );
}

function toggleSvg(theme, enabled) {
    const width = 128;
    const height = 64;
    const trackTop = enabled ? theme.primaryTop : theme.fillRaised;
    const trackBottom = enabled ? theme.primaryBottom : theme.secondaryBottom;
    const knobX = enabled ? 96 : 32;
    return svg(
        width,
        height,
        `<rect x="4" y="4" width="120" height="56" rx="28" fill="url(#toggle)" stroke="${theme.border}" stroke-width="2"/><circle cx="${knobX}" cy="32" r="22" fill="${theme.textHint}"/><circle cx="${knobX - 6}" cy="25" r="5" fill="#fff" opacity=".72"/>`,
        gradient("toggle", trackTop, trackBottom),
    );
}

function avatarSvg(theme, selected) {
    const ring = selected ? theme.border : theme.borderSoft;
    const ringWidth = selected ? 7 : 4;
    return svg(
        128,
        128,
        `<circle cx="64" cy="64" r="56" fill="#fff" stroke="${ring}" stroke-width="${ringWidth}"/><circle cx="64" cy="64" r="47" fill="none" stroke="#fff" stroke-width="2" opacity=".5"/>${selected ? `<path d="M64 2l5 11 12 2-9 9 2 12-10-6-11 6 3-12-9-9 12-2z" fill="${theme.border}"/>` : ""}`,
    );
}

function traceOrbSvg() {
    return svg(
        96,
        96,
        `<circle cx="48" cy="48" r="44" fill="#4BC5FF" opacity=".16"/><circle cx="48" cy="48" r="31" fill="url(#orb)" stroke="#B3F0FF" stroke-width="3"/><circle cx="39" cy="37" r="10" fill="#F4FEFF"/><circle cx="67" cy="65" r="4" fill="#8DEBFF" opacity=".8"/>`,
        `<radialGradient id="orb" cx="35%" cy="30%"><stop offset="0" stop-color="#F4FEFF"/><stop offset=".35" stop-color="#69DAFF"/><stop offset="1" stop-color="#416BD6"/></radialGradient>`,
    );
}

function coinSvg() {
    return svg(
        96,
        96,
        `<circle cx="48" cy="48" r="41" fill="#FFC43D" opacity=".2"/><circle cx="48" cy="48" r="31" fill="url(#coin)" stroke="#FFF0A1" stroke-width="4"/><circle cx="48" cy="48" r="20" fill="none" stroke="#FFF3B8" stroke-width="4"/><path d="M43 32h10v32H43z" fill="#FFF5C7" opacity=".72"/>`,
        `<radialGradient id="coin" cx="35%" cy="30%"><stop offset="0" stop-color="#FFF5BE"/><stop offset=".35" stop-color="#FFD45C"/><stop offset="1" stop-color="#D98B17"/></radialGradient>`,
    );
}

function bombSvg() {
    return svg(
        96,
        96,
        `<circle cx="44" cy="53" r="32" fill="url(#bomb)" stroke="#FF708A" stroke-width="4"/><path d="M59 28c7-10 18-8 20-19" fill="none" stroke="#FFC15C" stroke-width="5" stroke-linecap="round"/><circle cx="80" cy="8" r="6" fill="#FF6C55"/><circle cx="35" cy="42" r="8" fill="#7580A5" opacity=".7"/>`,
        `<radialGradient id="bomb" cx="35%" cy="30%"><stop offset="0" stop-color="#59648B"/><stop offset=".45" stop-color="#2B355E"/><stop offset="1" stop-color="#111833"/></radialGradient>`,
    );
}

function arenaOverlaySvg() {
    return svg(
        560,
        560,
        `<circle cx="280" cy="280" r="252" fill="#08152B" opacity=".78" stroke="#70DAE4" stroke-width="4"/><circle cx="280" cy="280" r="224" fill="none" stroke="#2A9DBF" stroke-width="2" opacity=".55"/><g fill="#70DAE4" opacity=".35">${Array.from({ length: 12 }, (_, index) => { const angle = index * Math.PI / 6; const x = 280 + Math.cos(angle) * 238; const y = 280 + Math.sin(angle) * 238; return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3"/>`; }).join("")}</g>`,
    );
}

async function writePng(filePath, input, options = {}) {
    const image = sharp(input);
    if (options.resize) {
        image.resize(options.resize);
    }
    await image.png(FINAL_PNG_OPTIONS).toFile(filePath);
}

function scenePlacement(width, height, centerX, centerY) {
    return {
        left: Math.round(320 + centerX - width / 2),
        top: Math.round(568 - centerY - height / 2),
    };
}

async function createExtendedBackground(sourcePath, targetPath) {
    const blurredBase = await sharp(sourcePath)
        .resize(BACKGROUND_WIDTH, BACKGROUND_HEIGHT, {
            fit: "cover",
            position: "centre",
        })
        .blur(22)
        .modulate({ brightness: 0.78, saturation: 0.9 })
        .png()
        .toBuffer();
    const centralHeight = 1200;
    const centralImage = await sharp(sourcePath)
        .resize(BACKGROUND_WIDTH, centralHeight, {
            fit: "cover",
            position: "centre",
        })
        .png()
        .toBuffer();
    const featherMask = svg(
        BACKGROUND_WIDTH,
        centralHeight,
        '<rect width="800" height="1200" fill="url(#fade)"/>',
        '<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".14" stop-color="#fff"/><stop offset=".86" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>',
    );
    const featheredCentral = await sharp(centralImage)
        .composite([{ input: featherMask, blend: "dest-in" }])
        .png()
        .toBuffer();
    await sharp(blurredBase)
        .composite([
            {
                input: featheredCentral,
                left: 0,
                top: Math.round((BACKGROUND_HEIGHT - centralHeight) / 2),
            },
        ])
        .png(FINAL_PNG_OPTIONS)
        .toFile(targetPath);
}

async function expandSafeComposite(input, backgroundPath = null) {
    const safeFrame = await sharp(input)
        .resize(BACKGROUND_WIDTH, SAFE_FRAME_HEIGHT)
        .png()
        .toBuffer();
    const base = backgroundPath
        ? sharp(backgroundPath)
        : sharp({
              create: {
                  width: BACKGROUND_WIDTH,
                  height: BACKGROUND_HEIGHT,
                  channels: 4,
                  background: { r: 0, g: 0, b: 0, alpha: 0 },
              },
          });
    return base
        .composite([{ input: safeFrame, left: 0, top: SAFE_FRAME_TOP }])
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
}

async function composite2048(outDir, backgroundPath) {
    const read = (name) => path.join(outDir, name);
    const designBackground = await sharp(backgroundPath)
        .extract({
            left: 0,
            top: SAFE_FRAME_TOP,
            width: BACKGROUND_WIDTH,
            height: SAFE_FRAME_HEIGHT,
        })
        .resize(640, 1136)
        .png()
        .toBuffer();
    const lobbyParts = [
        { input: arenaOverlaySvg(), ...scenePlacement(560, 560, 0, 82) },
        { input: await fs.readFile(read("item_square.png")), ...scenePlacement(72, 72, -112, 78) },
        { input: await fs.readFile(read("item_square.png")), ...scenePlacement(72, 72, -36, 78) },
        { input: await fs.readFile(read("item_square.png")), ...scenePlacement(72, 72, 40, 78) },
        { input: await fs.readFile(read("item_square.png")), ...scenePlacement(72, 72, 116, 78) },
        { input: await fs.readFile(read("item_rounded.png")), ...scenePlacement(536, 120, 0, -232) },
        { input: await fs.readFile(read("button_primary.png")), ...scenePlacement(380, 88, 0, -382) },
        { input: await fs.readFile(read("item_rounded.png")), ...scenePlacement(406, 92, -95, 500) },
        { input: await fs.readFile(read("icon_button.png")), ...scenePlacement(84, 84, 256, 500) },
    ];
    const lobbySafe = await sharp(designBackground)
        .composite(lobbyParts)
        .png()
        .toBuffer();
    await sharp(await expandSafeComposite(lobbySafe, backgroundPath)).png(FINAL_PNG_OPTIONS).toFile(
        read("lobby_composite.png"),
    );

    const bootParts = [
        { input: arenaOverlaySvg(), ...scenePlacement(504, 504, 0, 84) },
        { input: await fs.readFile(read("item_square.png")), ...scenePlacement(88, 88, -58, 170) },
        { input: await fs.readFile(read("item_square.png")), ...scenePlacement(88, 88, 44, 170) },
        { input: await fs.readFile(read("item_square.png")), ...scenePlacement(88, 88, -58, 68) },
        { input: await fs.readFile(read("item_square.png")), ...scenePlacement(88, 88, 44, 68) },
        { input: await fs.readFile(read("progress_track.png")), ...scenePlacement(440, 18, 0, -220) },
    ];
    const bootSafe = await sharp(designBackground)
        .composite(bootParts)
        .png()
        .toBuffer();
    await sharp(await expandSafeComposite(bootSafe, backgroundPath)).png(FINAL_PNG_OPTIONS).toFile(
        read("boot_composite.png"),
    );

    const resultParts = [
        { input: await fs.readFile(read("panel_large.png")), ...scenePlacement(520, 502, 0, -27) },
        { input: await fs.readFile(read("button_primary.png")), ...scenePlacement(348, 72, 0, -114) },
        { input: await fs.readFile(read("button_secondary.png")), ...scenePlacement(348, 64, 0, -210) },
    ];
    const resultSafe = await sharp({ create: { width: 640, height: 1136, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(resultParts)
        .png(FINAL_PNG_OPTIONS)
        .toBuffer();
    const fullOverlay = await sharp({ create: { width: BACKGROUND_WIDTH, height: BACKGROUND_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: await fs.readFile(read("overlay.png")), left: 0, top: 0, tile: true }])
        .png()
        .toBuffer();
    await sharp(fullOverlay)
        .composite([{ input: await expandSafeComposite(resultSafe), left: 0, top: 0 }])
        .png()
        .toFile(read("game_over_composite.png"));

    for (let mask = 0; mask < 4; mask += 1) {
        const soundOn = Boolean(mask & 1);
        const vibrationOn = Boolean(mask & 2);
        const parts = [
            { input: await fs.readFile(read("panel_large.png")), ...scenePlacement(600, 520, 0, -288) },
            { input: await fs.readFile(read("item_rounded.png")), ...scenePlacement(488, 104, 0, -192) },
            { input: await fs.readFile(read("item_rounded.png")), ...scenePlacement(488, 104, 0, -318) },
            { input: await fs.readFile(read("icon_button.png")), ...scenePlacement(72, 48, 216, -74) },
            { input: await fs.readFile(read(soundOn ? "toggle_on.png" : "toggle_off.png")), ...scenePlacement(96, 48, 176, -192) },
            { input: await fs.readFile(read(vibrationOn ? "toggle_on.png" : "toggle_off.png")), ...scenePlacement(96, 48, 176, -318) },
        ];
        const settingsSafe = await sharp({ create: { width: 640, height: 1136, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite(parts)
            .png(FINAL_PNG_OPTIONS)
            .toBuffer();
        await sharp(fullOverlay)
            .composite([{ input: await expandSafeComposite(settingsSafe), left: 0, top: 0 }])
            .png()
            .toFile(read(`settings_${soundOn ? "on" : "off"}_${vibrationOn ? "on" : "off"}.png`));
    }
}

async function main() {
    const { theme: themeId, background, out } = parseArgs(process.argv.slice(2));
    const theme = THEMES[themeId];
    await fs.mkdir(out, { recursive: true });

    const backgroundPath = path.join(out, "background.png");
    await createExtendedBackground(background, backgroundPath);

    const assets = [
        ["panel_large.png", surfaceSvg(theme, 192, 192, 30, { shadow: true }), [38, 38, 38, 38], "sliced"],
        ["panel_small.png", surfaceSvg(theme, 128, 128, 24, { shadow: true }), [30, 30, 30, 30], "sliced"],
        ["button_primary.png", surfaceSvg(theme, 256, 96, 30, { top: theme.primaryTop, bottom: theme.primaryBottom, border: theme.border, motif: false, shadow: true }), [42, 42, 28, 28], "sliced"],
        ["button_secondary.png", surfaceSvg(theme, 256, 96, 28, { top: theme.secondaryTop, bottom: theme.secondaryBottom, border: theme.borderSoft, motif: false, shadow: true }), [40, 40, 26, 26], "sliced"],
        ["button_danger.png", surfaceSvg(theme, 256, 96, 28, { top: theme.dangerTop, bottom: theme.dangerBottom, border: "#FFD2CF", motif: false, shadow: true }), [40, 40, 26, 26], "sliced"],
        ["item_rounded.png", surfaceSvg(theme, 128, 128, 24), [30, 30, 30, 30], "sliced"],
        ["item_square.png", surfaceSvg(theme, 128, 128, 12), [20, 20, 20, 20], "sliced"],
        ["input_field.png", surfaceSvg(theme, 192, 80, 16, { top: theme.fillRaised, bottom: theme.fillSoft, motif: false }), [24, 24, 20, 20], "sliced"],
        ["progress_track.png", surfaceSvg(theme, 256, 32, 14, { top: theme.fillRaised, bottom: theme.fill, border: theme.borderSoft, borderWidth: 2, motif: false }), [18, 18, 12, 12], "sliced"],
        ["progress_fill.png", surfaceSvg(theme, 256, 32, 14, { top: theme.primaryTop, bottom: theme.primaryBottom, border: theme.border, borderWidth: 2, motif: false }), [18, 18, 12, 12], "sliced"],
        ["toggle_on.png", toggleSvg(theme, true), [32, 32, 28, 28], "sliced"],
        ["toggle_off.png", toggleSvg(theme, false), [32, 32, 28, 28], "sliced"],
        ["icon_button.png", surfaceSvg(theme, 96, 96, 30, { top: theme.fillRaised, bottom: theme.fill, border: theme.border, motif: false, shadow: true }), [30, 30, 30, 30], "sliced"],
        ["avatar_frame.png", avatarSvg(theme, false), [0, 0, 0, 0], "simple"],
        ["avatar_frame_selected.png", avatarSvg(theme, true), [0, 0, 0, 0], "simple"],
        ["overlay.png", svg(64, 64, `<rect width="64" height="64" fill="${theme.overlay}"/>`), [0, 0, 0, 0], "simple"],
    ];

    if (themeId === "2048") {
        assets.push(["tile_blank.png", surfaceSvg(theme, 128, 128, 18, { top: "#E8FBFF", bottom: "#70DAE4", border: "#FFFFFF", motif: false }), [22, 22, 22, 22], "sliced"]);
    }
    if (themeId === "puzzle") {
        assets.push(["puzzle_slot.png", surfaceSvg(theme, 128, 128, 10, { top: "#FFFDF3", bottom: "#EFDDBA", border: theme.border, motif: true }), [20, 20, 20, 20], "sliced"]);
    }
    if (themeId === "trace") {
        assets.push(["player_orb.png", traceOrbSvg(), [0, 0, 0, 0], "simple"]);
        assets.push(["coin.png", coinSvg(), [0, 0, 0, 0], "simple"]);
        assets.push(["bomb.png", bombSvg(), [0, 0, 0, 0], "simple"]);
    }

    const manifestAssets = [];
    for (const [fileName, input, insets, spriteType] of assets) {
        await writePng(path.join(out, fileName), input);
        manifestAssets.push({ file: fileName, spriteType, insets });
    }

    if (themeId === "2048") {
        await composite2048(out, backgroundPath);
        for (const file of [
            "lobby_composite.png",
            "boot_composite.png",
            "game_over_composite.png",
            "settings_off_off.png",
            "settings_on_off.png",
            "settings_off_on.png",
            "settings_on_on.png",
        ]) {
            manifestAssets.push({ file, spriteType: "simple", insets: [0, 0, 0, 0] });
        }
    }

    const manifest = {
        schemaVersion: 1,
        theme: themeId,
        title: theme.name,
        designResolution: { width: 640, height: 1136 },
        backgroundResolution: {
            width: BACKGROUND_WIDTH,
            height: BACKGROUND_HEIGHT,
            fit: "visible-width",
            safeFrame: { width: 640, height: 1136 },
        },
        nineSliceRule: "装饰仅位于边缘与角部；运行时按 insets 设置 SpriteFrame 后使用 Sprite.Type.SLICED。",
        assets: [{ file: "background.png", spriteType: "simple", insets: [0, 0, 0, 0] }, ...manifestAssets],
    };
    await fs.writeFile(
        path.join(out, "ui-kit-manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
    );
    console.log(`Generated ${manifest.assets.length} assets for ${theme.name} at ${out}`);
}

await main();
