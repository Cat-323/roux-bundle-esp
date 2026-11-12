#!/usr/bin/env node
// @ts-nocheck
/* eslint-disable no-restricted-syntax */
/**
 * Traduce los textos de interfaz de src/plugins/ y src/rain/pages/Plugins/ al español
 * usando Groq API y un archivo caché por hash (scripts/plugins-i18n-cache.json) para
 * evitar conflictos con upstream y ahorrar peticiones en cada actualización.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_FILE = path.join(ROOT, "scripts", "plugins-i18n-cache.json");
const API_URL = "https://api.groq.com/openai/v1/chat/completions";

const MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
];

const DELAY_BETWEEN_FILES_MS = 1800;
const MAX_ROUNDS_PER_FILE = 3;
const DEFAULT_RETRY_AFTER_MS = 10_000;
const MAX_RETRY_AFTER_MS = 90_000;
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_FILE_CHARS = 32_000;

const SYSTEM_PROMPT = [
    "You are a professional software localization engine for \"RouxCord\", a React Native / TypeScript Discord client mod.",
    "Translate ONLY the user-facing UI strings inside the provided TypeScript/TSX file into neutral Spanish (es).",
    "",
    "STRICT RULES:",
    "1. TRANSLATE ONLY:",
    "   - The 'description' string inside definePlugin({ ... }).",
    "   - User-visible UI props: label, subLabel, title, placeholder, description, text, message.",
    "   - User-facing messages in showToast(...), alerts, confirmations, or action sheets.",
    "2. NEVER TRANSLATE OR MODIFY:",
    "   - Import paths (such as '@rain/Developers'), variable names, function names, component names, types, interfaces, or storage keys.",
    "   - The 'id' or 'name' fields of definePlugin({ ... }) (keep plugin names like 'FakeNitro', 'MessageLogger', 'CleanURLs' intact).",
    "   - Asset/icon names (e.g. 'CheckmarkLargeIcon'), URLs, regexes, or technical constants.",
    "3. Inside translated Spanish UI strings ONLY, replace 'Rain' with 'Roux' and 'Raincord' with 'RouxCord'.",
    "4. Return ONLY valid, complete TypeScript/TSX code. No markdown fences (```), no comments, no explanations.",
].join("\n");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = text => createHash("sha256").update(text).digest("hex");

function parseRetryAfter(value) {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
    const date = Date.parse(value);
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function cleanCode(raw) {
    if (typeof raw !== "string") throw new Error("La respuesta no contiene texto");
    return raw
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim()
        .replace(/^```(?:tsx?|typescript|javascript|jsx?)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
}

async function validateSyntax(originalCode, translatedCode, filePath) {
    if (translatedCode.length < originalCode.length * 0.45) {
        throw new Error("El archivo devuelto parece truncado");
    }
    if (originalCode.includes("definePlugin(") && !translatedCode.includes("definePlugin(")) {
        throw new Error("Se perdió la llamada a definePlugin");
    }
    const loader = filePath.endsWith(".tsx") ? "tsx" : "ts";
    await transform(translatedCode, { loader });
}

async function gatherFiles(dir) {
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // rouxpresence ya está escrito directamente en español
            if (entry.name === "rouxpresence") continue;
            files.push(...(await gatherFiles(fullPath)));
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
            files.push(fullPath);
        }
    }
    return files;
}

function hasTranslatableStrings(code) {
    if (code.length > MAX_FILE_CHARS) return false;
    return /(description|label|subLabel|title|placeholder|message|showToast|showSimpleActionSheet|showConfirmationAlert|showInputAlert)\s*[:(]/.test(code);
}

async function callGroq(model, code, relPath, apiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const body = {
        model,
        temperature: 0.1,
        max_completion_tokens: 16000,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Archivo: ${relPath}\n\n${code}` },
        ],
    };

    if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";

    let response;
    try {
        response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        const retryAfterMs = response.status === 429
            ? (parseRetryAfter(response.headers.get("retry-after")) ?? DEFAULT_RETRY_AFTER_MS)
            : null;
        const err = new Error(`HTTP ${response.status}: ${detail}`);
        err.status = response.status;
        err.retryAfterMs = retryAfterMs;
        throw err;
    }

    const data = await response.json();
    return cleanCode(data?.choices?.[0]?.message?.content);
}

let modelIndex = 0;

async function translateFile(code, filePath, relPath, apiKey) {
    const maxAttempts = MODELS.length * MAX_ROUNDS_PER_FILE;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const model = MODELS[modelIndex];
        try {
            console.log(`  [${relPath}] intento ${attempt}/${maxAttempts} con ${model}`);
            const translated = await callGroq(model, code, relPath, apiKey) + "\n";
            await validateSyntax(code, translated, filePath);
            return translated;
        } catch (error) {
            lastError = error;
            console.warn(`  [${relPath}] ${model} falló: ${error.message}`);
            if (error.status === 429) {
                const wait = Math.min(error.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS, MAX_RETRY_AFTER_MS);
                await sleep(wait);
            } else {
                await sleep(1500);
            }
            modelIndex = (modelIndex + 1) % MODELS.length;
        }
    }

    throw new Error(`No se pudo traducir ${relPath}: ${lastError?.message}`);
}

async function main() {
    const apiKey = process.env.GROQ_API_KEY;

    let cache = {};
    if (existsSync(CACHE_FILE)) {
        try {
            cache = JSON.parse(await readFile(CACHE_FILE, "utf-8"));
        } catch {
            cache = {};
        }
    }

    const scanRoots = [
        path.join(ROOT, "src", "plugins"),
        path.join(ROOT, "src", "rain", "pages", "Plugins"),
        path.join(ROOT, "src", "rain", "pages", "Addon"),
    ];

    const files = [];
    for (const dir of scanRoots) {
        files.push(...(await gatherFiles(dir)));
    }

    const toTranslate = [];
    let appliedFromCache = 0;

    for (const file of files) {
        const content = await readFile(file, "utf-8");
        if (!hasTranslatableStrings(content)) continue;

        const relPath = path.relative(ROOT, file).replace(/\\/g, "/");
        const hash = sha256(content);
        const cached = cache[relPath];

        if (cached && cached.hash === hash && typeof cached.code === "string") {
            if (cached.code !== content) {
                await writeFile(file, cached.code, "utf-8");
            }
            appliedFromCache++;
        } else {
            toTranslate.push({ file, relPath, content, hash });
        }
    }

    console.log(`Caché aplicada en ${appliedFromCache} archivos. Pendientes de traducir por IA: ${toTranslate.length}.`);

    if (toTranslate.length === 0) return;

    if (!apiKey) {
        console.warn("Aviso: GROQ_API_KEY no está definida; se omiten los archivos nuevos sin caché.");
        return;
    }

    for (let i = 0; i < toTranslate.length; i++) {
        const { file, relPath, content, hash } = toTranslate[i];
        console.log(`[${i + 1}/${toTranslate.length}] Traduciendo ${relPath}...`);
        try {
            const translated = await translateFile(content, file, relPath, apiKey);
            await writeFile(file, translated, "utf-8");
            cache[relPath] = { hash, code: translated };
            await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2) + "\n", "utf-8");
        } catch (err) {
            console.error(`Saltando ${relPath}: ${err.message}`);
        }
        if (i < toTranslate.length - 1) await sleep(DELAY_BETWEEN_FILES_MS);
    }

    console.log("Parches de traducción aplicados correctamente.");
}

main().catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
});