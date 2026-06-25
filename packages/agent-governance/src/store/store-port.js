"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInMemoryAgentPassportStore = createInMemoryAgentPassportStore;
function createInMemoryAgentPassportStore() {
    const bundles = new Map();
    const events = new Map();
    return {
        async savePassportBundle(bundle) {
            bundles.set(bundle.passport.passportId, bundle);
            events.set(bundle.passport.passportId, [...bundle.events]);
        },
        async getPassport(passportId) {
            return bundles.get(passportId)?.passport;
        },
        async getPassportBundle(passportId) {
            return bundles.get(passportId);
        },
        async appendPassportEvent(event) {
            const list = events.get(event.passportId) ?? [];
            list.push(event);
            events.set(event.passportId, list);
        },
        async listPassportEvents(passportId) {
            return events.get(passportId) ?? [];
        },
    };
}
