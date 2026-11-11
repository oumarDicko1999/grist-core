import { parseIkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

import { assert } from "chai";

const HARNESS_DIR = resolve(process.cwd(), "devtools/ikadoc-runtime-harness");
const FIXTURE_DIR = join(HARNESS_DIR, "fixtures");

const PLACEHOLDER_VALUES: Record<string, string> = {
  sessionId: "search-editor",
  documentId: "harnessDoc123",
  expiresAt: "2099-01-01T00:00:00.000Z",
  gristOrigin: "http://localhost:8484",
  harnessUrl: "http://127.0.0.1:18585",
  locale: "fr-FR",
  theme: "owarelin",
  appearance: "light",
};

/** GW-DEV-01/02: the dev stand-in for IkaDoc stays out of images and speaks the contract. */
describe("IkaDoc runtime harness", function() {
  it("is never admitted into the Docker build context", function() {
    const rules = readFileSync(resolve(process.cwd(), ".dockerignore"), "utf8")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith("#"));

    assert.equal(rules[0], "*", ".dockerignore must exclude everything by default");

    const admitsDevtools = rules.some(rule => rule.startsWith("!devtools"));
    assert.isFalse(admitsDevtools, "devtools must stay excluded");
  });

  const fixtureFiles = readdirSync(FIXTURE_DIR).filter(name => name.endsWith(".json"));

  for (const file of fixtureFiles) {
    it(`fixture ${file} is an accepted admission with a valid runtime config`, function() {
      const template = readFileSync(join(FIXTURE_DIR, file), "utf8");

      const filled = template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
        assert.property(PLACEHOLDER_VALUES, name, `unknown placeholder ${match}`);

        return PLACEHOLDER_VALUES[name];
      });

      const response = JSON.parse(filled);
      assert.equal(response.kind, "accepted");

      const { admission } = response;
      const parsed = parseIkaDocRuntimeConfig(admission.runtimeConfig);
      assert.equal(parsed.kind, "enabled", `runtime config rejected: ${JSON.stringify(parsed)}`);

      assert.deepEqual(admission.capabilities, admission.runtimeConfig.capabilities);
      assert.equal(admission.mode, admission.runtimeConfig.mode);
    });
  }
});
