import { expect as baseExpect, test as baseTest } from "@playwright/test";

type DiagnosticFixtures = {
  runtimeDiagnostics: void;
};

export const test = baseTest.extend<DiagnosticFixtures>({
  runtimeDiagnostics: [
    async ({ page }, use) => {
      const failures: string[] = [];

      page.on("pageerror", (error) => {
        failures.push(`JavaScript: ${error.message}`);
      });
      page.on("response", (response) => {
        if (response.status() >= 500)
          failures.push(`HTTP ${response.status()}: ${response.url()}`);
      });

      await use();

      baseExpect(
        failures,
        "The browser must not report an uncaught JavaScript error or HTTP 5xx response",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export const expect = baseExpect;
