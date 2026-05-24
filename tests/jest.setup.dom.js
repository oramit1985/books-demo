/**
 * Jest setup file for the jsdom test environment.
 *
 * Polyfills globals that jsdom omits but that our test utilities need,
 * and sets up per-test DOM isolation.
 */

'use strict';

const { TextEncoder, TextDecoder } = require('util');

// jsdom in some versions of jest-environment-jsdom doesn't expose these on
// globalThis even though Node has them.
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
