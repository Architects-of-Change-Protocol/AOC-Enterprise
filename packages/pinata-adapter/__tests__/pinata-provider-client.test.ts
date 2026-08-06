import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PinataProviderClientError, createPinataProviderClient } from '../src/pinata-provider-client.js';

describe('PinataProviderClientError', () => {
  it('carries exactly one closed EnterpriseProviderFailureReason and a plain message', () => {
    const error = new PinataProviderClientError('provider-unavailable', 'Pinata could not be reached.');
    assert.equal(error.failureReason, 'provider-unavailable');
    assert.equal(error.message, 'Pinata could not be reached.');
    assert.equal(error.name, 'PinataProviderClientError');
    assert.ok(error instanceof Error);
  });
});

describe('createPinataProviderClient', () => {
  it('constructs a client exposing exactly the narrow PinataProviderClient surface', () => {
    const client = createPinataProviderClient({ jwt: 'fake-jwt-not-a-real-credential' });
    assert.equal(typeof client.createTemporaryAccessLink, 'function');
    assert.equal(typeof client.getResourceMetadata, 'function');
    assert.equal(typeof client.invalidateResource, 'function');
    assert.equal(typeof client.uploadCiphertext, 'function');
  });

  it('constructs a client with an optional dedicated gateway', () => {
    const client = createPinataProviderClient({ jwt: 'fake-jwt-not-a-real-credential', gateway: 'example.mypinata.cloud' });
    assert.equal(typeof client.createTemporaryAccessLink, 'function');
  });
});
