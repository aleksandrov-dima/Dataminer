// Jest setup file for DOM environment
// This file runs before each test file

// Polyfill for TextEncoder/TextDecoder (required for jsdom)
const { TextEncoder, TextDecoder } = require('util');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Also add to global for jsdom compatibility
if (typeof global.TextEncoder === 'undefined') {
    global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
    global.TextDecoder = TextDecoder;
}

