const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: process.env.CI ? "github" : "line",
  retries: process.env.CI ? 1 : 0,
  testDir: "extension/tests/browser",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    cwd: __dirname,
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
    url: "http://127.0.0.1:4173/qa/manual-test-page.html",
  },
});
