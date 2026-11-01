#!/usr/bin/env node
// @ts-nocheck
/* eslint-disable no-restricted-syntax */
/**
 * Traduce src/rain/i18n/default.json al español con la API de Groq.
 *
 * - Lotes de 38 claves, 2 s de pausa entre lotes.
 * - Rotación de modelos ante error o 429 (respetando la cabecera retry-after).
 * - Valida claves y {placeholders} antes de aceptar un lote.
 * - Solo sobrescribe el archivo si TODOS los lotes se tradujeron correctamente.
 *
 * Uso: GROQ_API_KEY=xxx node scripts/translate.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_FILE = path.join(ROOT, "src", "rain", "i18n", "default.json");

const API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Orden de rotación ante fallos o 429.
const MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
];

const CHUNK_SIZE = 38;                  // 35-40 claves por lote
const DELAY_BETWEEN_CHUNKS_MS = 2000;   // pausa tras cada lote completado
const MAX_ROUNDS_PER_CHUNK = 3;         // vueltas completas a la lista de modelos por lote
const DEFAULT_RETRY_AFTER_MS = 10_000;  // si un 429 llega sin retry-after
const MAX_RETRY_AFTER_MS = 90_000;      // tope de espera (si es mayor, se rota igualmente)
const REQUEST_TIMEOUT_MS = 90_000;
const OTHER_ERROR_BACKOFF_MS = 1500;

// Términos que nunca se traducen (si el valor original es exactamente uno de ellos, se conserva tal cual).
const KEEP_EXACT = new Set([
    "Nitro",
    "Webhook",
    "ErrorBoundary",
    "DevTools",
    "Debugger",
    "React Native",
    "Hermes Bytecode",
    "Discord",
    "GitHub",
    "Codeberg",
    "Kofi",
    "SDK",
    "React",
]);

const SYSTEM_PROMPT = [
    "You are a professional software localization engine. You translate the UI strings of \"RouxCord\", a Discord mobile client mod, from English into neutral Spanish (es).",
    "",
    "STRICT RULES:",
    "1. The input is a flat JSON object {\"KEY\": \"English text\"}. Return ONLY a JSON object with EXACTLY the same keys and the translated values. Never add, remove, rename or reorder keys.",
    "2. Keep every placeholder between curly braces exactly as written, for example {name} or {type}. Never translate or modify anything inside curly braces.",
    "3. Do NOT translate these technical terms, keep them verbatim: \"Nitro\", \"Webhook\", \"ErrorBoundary\", \"DevTools\", \"Debugger\", \"React Native\", \"Hermes Bytecode\". Also keep the brand names Discord, GitHub, Codeberg, Kofi, SDK and React unchanged.",
    "4. In the Spanish text, replace \"Rain\" with \"Roux\" and \"Raincord\" with \"RouxCord\".",
    "5. These are short UI labels: keep them concise and keep punctuation such as ellipses (...) and colons.",
    "6. Output valid JSON only. No markdown, no code fences, no comments, no explanations.",
].join("\n");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class GroqError extends Error {
    constructor(message, status = 0, retryAfterMs = null) {
        super(message);
        this.name = "GroqError";
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

function parseRetryAfter(value) {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
    const date = Date.parse(value);
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function extractJson(raw) {
    if (typeof raw !== "string") throw new Error("La respuesta no contiene texto");

    // Qwen puede emitir razonamiento entre <think>...</think>
    let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    // Quita posibles fences ```json ... ```
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) throw new Error("No se encontró un objeto JSON en la respuesta");

    return JSON.parse(text.slice(start, end + 1));
}

function placeholders(value) {
    return (String(value).match(/\{[^{}]*\}/g) ?? []).sort();
}

function samePlaceholders(a, b) {
    const pa = placeholders(a);
    const pb = placeholders(b);
    return pa.length === pb.length && pa.every((p, i) => p === pb[i]);
}

/** Garantiza la marca Roux/RouxCord aunque el modelo se olvide de aplicarla. */
function applyBranding(text) {
    return text
        .replace(/raincord/gi, "RouxCord")
        .replace(/\brain(?=[A-Z]|\b)/gi, "Roux");
}

function validateChunk(source, translated) {
    if (!translated || typeof translated !== "object" || Array.isArray(translated)) {
        throw new Error("La respuesta no es un objeto JSON plano");
    }

    const result = {};
    for (const [key, original] of Object.entries(source)) {
        if (!(key in translated)) throw new Error(`Falta la clave "${key}"`);

        const value = translated[key];
        if (typeof value !== "string" || value.trim() === "") {
            throw new Error(`Valor vacío o no textual en la clave "${key}"`);
        }
        if (!samePlaceholders(original, value)) {
            throw new Error(`Los placeholders de "${key}" no coinciden: ${JSON.stringify(placeholders(original))} vs ${JSON.stringify(placeholders(value))}`);
        }

        result[key] = KEEP_EXACT.has(original.trim()) ? original : applyBranding(value);
    }

    return result;
}

async function callGroq(model, chunk, apiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const body = {
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        max_completion_tokens: 4000,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(chunk, null, 2) },
        ],
    };

    // Los modelos gpt-oss razonan antes de responder; "low" ahorra tokens del límite TPM.
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
    } catch (error) {
        throw new GroqError(error?.name === "AbortError" ? `Timeout tras ${REQUEST_TIMEOUT_MS} ms` : `Error de red: ${error.message}`);
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        const retryAfterMs = response.status === 429
            ? (parseRetryAfter(response.headers.get("retry-after")) ?? DEFAULT_RETRY_AFTER_MS)
            : null;
        throw new GroqError(`HTTP ${response.status}: ${detail}`, response.status, retryAfterMs);
    }

    const data = await response.json();
    return extractJson(data?.choices?.[0]?.message?.content);
}

// Índice del modelo activo: se mantiene entre lotes y solo rota cuando falla.
let modelIndex = 0;

async function translateChunk(chunk, apiKey, label) {
    const maxAttempts = MODELS.length * MAX_ROUNDS_PER_CHUNK;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const model = MODELS[modelIndex];

        try {
            console.log(`  [${label}] intento ${attempt}/${maxAttempts} con ${model}`);
            const translated = await callGroq(model, chunk, apiKey);
            return validateChunk(chunk, translated);
        } catch (error) {
            lastError = error;
            console.warn(`  [${label}] ${model} falló: ${error.message}`);

            if (error instanceof GroqError && error.status === 429) {
                const wait = Math.min(error.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS, MAX_RETRY_AFTER_MS);
                console.warn(`  [${label}] 429 recibido, pausa de ${(wait / 1000).toFixed(1)} s (retry-after) y rotación de modelo`);
                await sleep(wait);
            } else {
                await sleep(OTHER_ERROR_BACKOFF_MS);
            }

            // Rotación inmediata al siguiente modelo de la lista.
            modelIndex = (modelIndex + 1) % MODELS.length;
        }
    }

    throw new Error(`No se pudo traducir el lote ${label} tras ${maxAttempts} intentos. Último error: ${lastError?.message}`);
}

async function main() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.error("Falta la variable de entorno GROQ_API_KEY.");
        process.exit(1);
    }

    const source = JSON.parse(await readFile(TARGET_FILE, "utf-8"));
    const entries = Object.entries(source);

    for (const [key, value] of entries) {
        if (typeof value !== "string") {
            throw new Error(`default.json debe ser un JSON plano de cadenas; la clave "${key}" no lo es`);
        }
    }

    const chunks = [];
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        chunks.push(Object.fromEntries(entries.slice(i, i + CHUNK_SIZE)));
    }

    console.log(`Traduciendo ${entries.length} claves en ${chunks.length} lotes (modelos: ${MODELS.join(" -> ")})`);

    const translated = {};
    for (let i = 0; i < chunks.length; i++) {
        const label = `${i + 1}/${chunks.length}`;
        console.log(`Lote ${label} (${Object.keys(chunks[i]).length} claves)`);

        Object.assign(translated, await translateChunk(chunks[i], apiKey, label));
        console.log(`Lote ${label} completado`);

        if (i < chunks.length - 1) await sleep(DELAY_BETWEEN_CHUNKS_MS);
    }

    // Conserva el orden original de las claves.
    const output = {};
    for (const [key] of entries) output[key] = translated[key];

    await writeFile(TARGET_FILE, JSON.stringify(output, null, 4) + "\n", "utf-8");
    console.log(`OK: ${entries.length} claves escritas en ${path.relative(ROOT, TARGET_FILE)}`);
}

main().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
});
