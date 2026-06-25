"use strict";
/**
 * MVP in-memory passport store.
 *
 * WARNING: Non-production. Data is lost on server restart.
 * Replace with a persistent store before any production use.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.storePassportBundle = storePassportBundle;
exports.getPassportBundle = getPassportBundle;
exports.getAllPassportIds = getAllPassportIds;
// Module-level singleton — persists across Next.js requests within a single process.
const passportStore = new Map();
function storePassportBundle(bundle) {
    passportStore.set(bundle.passport.passportId, bundle);
}
function getPassportBundle(passportId) {
    return passportStore.get(passportId);
}
function getAllPassportIds() {
    return Array.from(passportStore.keys());
}
