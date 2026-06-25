"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizeJson = canonicalizeJson;
exports.sha256Hex = sha256Hex;
exports.createHashUrn = createHashUrn;
const crypto_1 = require("crypto");
function sortKeys(value) {
    if (value === null || typeof value !== 'object')
        return value;
    if (Array.isArray(value))
        return value.map(sortKeys);
    const obj = value;
    return Object.keys(obj)
        .sort()
        .reduce((acc, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
    }, {});
}
function canonicalizeJson(value) {
    return JSON.stringify(sortKeys(value));
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf8').digest('hex');
}
function createHashUrn(input) {
    return `sha256:${sha256Hex(input)}`;
}
