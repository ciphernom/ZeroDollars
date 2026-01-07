// js/config.js
const IS_PRODUCTION = false; // Set to false when debugging

if (IS_PRODUCTION) {
    console.log = function() {}; 
    console.info = function() {};
    // We keep console.error and console.warn for critical issues
}
