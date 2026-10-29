const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/browser',
    testMatch: '**/*.spec.cjs',
    workers: 1,
    timeout: 30000,
    use: {browserName: 'chromium', viewport: {width: 1000, height: 720}, deviceScaleFactor: 2},
});
