import fs from "node:fs";
import path from "node:path";
import { InputError } from "../errors.js";
export const CONFIG_FILENAME = ".ekko-benchmark.json";
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function object(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new InputError(`${label} must be a JSON object.`);
    }
    return value;
}
function rejectUnknownKeys(value, allowed, label) {
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length > 0)
        throw new InputError(`${label} contains unknown field '${unknown[0]}'.`);
}
export function loadConfig(root) {
    const configPath = path.join(root, CONFIG_FILENAME);
    if (!fs.existsSync(configPath))
        return { path: null, profile: null, minScore: null, waivers: [] };
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    catch (error) {
        throw new InputError(`${CONFIG_FILENAME} is not valid JSON: ${errorMessage(error)}`);
    }
    const parsed = object(raw, CONFIG_FILENAME);
    rejectUnknownKeys(parsed, ["profile", "minScore", "waivers"], CONFIG_FILENAME);
    if (parsed.profile !== undefined && (typeof parsed.profile !== "string" || parsed.profile.trim() === "")) {
        throw new InputError(`${CONFIG_FILENAME}.profile must be a non-empty string.`);
    }
    if (parsed.minScore !== undefined && (typeof parsed.minScore !== "number" || parsed.minScore < 0 || parsed.minScore > 100)) {
        throw new InputError(`${CONFIG_FILENAME}.minScore must be between 0 and 100.`);
    }
    if (parsed.waivers !== undefined && !Array.isArray(parsed.waivers)) {
        throw new InputError(`${CONFIG_FILENAME}.waivers must be an array.`);
    }
    const waivers = (parsed.waivers ?? []).map((rawWaiver, index) => {
        const waiver = object(rawWaiver, `${CONFIG_FILENAME}.waivers[${index}]`);
        rejectUnknownKeys(waiver, ["rule", "reason"], `${CONFIG_FILENAME}.waivers[${index}]`);
        if (typeof waiver.rule !== "string" || waiver.rule.trim() === "") {
            throw new InputError(`${CONFIG_FILENAME}.waivers[${index}].rule must be a non-empty string.`);
        }
        if (typeof waiver.reason !== "string" || waiver.reason.trim().length < 8) {
            throw new InputError(`${CONFIG_FILENAME}.waivers[${index}].reason must explain the exception in at least 8 characters.`);
        }
        return { rule: waiver.rule, reason: waiver.reason.trim() };
    });
    const duplicate = waivers.find((waiver, index) => waivers.findIndex((candidate) => candidate.rule === waiver.rule) !== index);
    if (duplicate)
        throw new InputError(`${CONFIG_FILENAME} contains duplicate waiver for '${duplicate.rule}'.`);
    return {
        path: CONFIG_FILENAME,
        profile: typeof parsed.profile === "string" ? parsed.profile : null,
        minScore: typeof parsed.minScore === "number" ? parsed.minScore : null,
        waivers
    };
}
