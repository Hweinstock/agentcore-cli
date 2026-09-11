import { afterEach, test, expect, describe } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createRootHandler } from "../../../index";
import {
  createSilentLogger,
  initProject,
  TestCoreClient,
  TestGlobalConfigAccessor,
  testIO,
} from "../../../../testing";

async function run(
  args: string[],
  opts?: { core?: TestCoreClient; stdin?: string; platform?: NodeJS.Platform },
) {
  const io = testIO({ stdin: opts?.stdin });
  const core = opts?.core ?? new TestCoreClient();
  const root = createRootHandler(core, {
    io: io.io,
    globalConfigAccessor: new TestGlobalConfigAccessor(),
    logger: createSilentLogger(),
    platform: opts?.platform,
  });
  await root.route(["node", "agentcore", "project", ...args]);
  return { io, core };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(() => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe("project add credentials", () => {
  test("--json reports the credential without exposing its secret", async () => {
    const { projectRoot, cleanup } = await initProject();
    cleanups.push(cleanup);
    const keyPath = join(projectRoot, "key.txt");
    await Bun.write(keyPath, "sk-secret-value\n");

    const { io } = await run([
      "add",
      "credentials",
      "api-key",
      "--name",
      "svc-key",
      "--api-key",
      `file://${keyPath}`,
      "--json",
    ]);

    expect(JSON.parse(io.stdout())).toEqual({
      operation: "add",
      project: { name: "TestProject", path: projectRoot },
      resource: { type: "credential", name: "svc-key" },
    });
    expect(io.stdout()).not.toContain("sk-secret-value");
    expect(io.stderr()).not.toContain("added credential");
  });

  test("api-key with a file:// secret records the spec entry and stores the trailing-newline-stripped key in .env.local", async () => {
    const { projectRoot, cleanup } = await initProject();
    cleanups.push(cleanup);
    const keyPath = join(projectRoot, "key.txt");
    // The trailing newline mirrors `echo` and editor output; it must not reach the value.
    await Bun.write(keyPath, "sk-123\n");

    await run([
      "add",
      "credentials",
      "api-key",
      "--name",
      "svc-key",
      "--api-key",
      `file://${keyPath}`,
    ]);

    const agentcoreJson = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(agentcoreJson.credentials).toEqual([
      { authorizerType: "ApiKeyCredentialProvider", name: "svc-key" },
    ]);

    const env = await Bun.file(join(projectRoot, "agentcore", ".env.local")).text();
    expect(env).toContain("AGENTCORE_CREDENTIAL_SVC_KEY='sk-123'\n");
    expect(env).not.toContain("AGENTCORE_CREDENTIAL_SVC_KEY='sk-123'\n\n");
  });

  test("api-key without a secret writes a commented placeholder and tells the user to fill it", async () => {
    const { projectRoot, cleanup } = await initProject();
    cleanups.push(cleanup);
    const { io } = await run(["add", "credentials", "api-key", "--name", "svc-key"]);

    const env = await Bun.file(join(projectRoot, "agentcore", ".env.local")).text();
    expect(env).toContain("# API key for credential provider 'svc-key' (set before deploy)");
    expect(env).toContain("AGENTCORE_CREDENTIAL_SVC_KEY=\n");
    expect(io.stderr()).toContain(
      "Set AGENTCORE_CREDENTIAL_SVC_KEY in agentcore/.env.local before you deploy",
    );
  });

  test("--json reports credential setup guidance as structured notes", async () => {
    const { cleanup } = await initProject();
    cleanups.push(cleanup);
    const { io } = await run(["add", "credentials", "api-key", "--name", "svc-key", "--json"]);

    expect(JSON.parse(io.stdout()).notes).toEqual([
      "Set AGENTCORE_CREDENTIAL_SVC_KEY in agentcore/.env.local before you deploy.",
    ]);
    expect(io.stderr()).not.toContain("before you deploy");
  });

  test("api-key with an external secret reference records it in the spec and skips .env.local", async () => {
    const { projectRoot, cleanup } = await initProject();
    cleanups.push(cleanup);
    const secretRef = {
      secretId: "arn:aws:secretsmanager:us-west-2:123456789012:secret:s",
      jsonKey: "apiKey",
    };

    await run([
      "add",
      "credentials",
      "api-key",
      "--name",
      "svc-key",
      "--api-key-secret-reference",
      JSON.stringify(secretRef),
    ]);

    const agentcoreJson = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(agentcoreJson.credentials).toEqual([
      { authorizerType: "ApiKeyCredentialProvider", name: "svc-key", secretRef },
    ]);
    const env = await Bun.file(join(projectRoot, "agentcore", ".env.local")).text();
    expect(env).not.toContain("AGENTCORE_CREDENTIAL_SVC_KEY");
  });

  const discoveryUrl = "https://idp.example.com/.well-known/openid-configuration";

  test("oauth custom with guided flags and a stdin secret records the spec entry and the secret", async () => {
    const { projectRoot, cleanup } = await initProject();
    cleanups.push(cleanup);

    await run(
      [
        "add",
        "credentials",
        "oauth",
        "--name",
        "idp",
        "--discovery-url",
        discoveryUrl,
        "--client-id",
        "client-1",
        "--scopes",
        "openid",
        "email",
        "--client-secret",
        "-",
      ],
      { stdin: "sssh" },
    );

    const agentcoreJson = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(agentcoreJson.credentials).toEqual([
      {
        authorizerType: "OAuthCredentialProvider",
        name: "idp",
        vendor: "CustomOauth2",
        clientId: "client-1",
        discoveryUrl,
        scopes: ["openid", "email"],
      },
    ]);

    const env = await Bun.file(join(projectRoot, "agentcore", ".env.local")).text();
    expect(env).toContain("AGENTCORE_CREDENTIAL_IDP_CLIENT_SECRET='sssh'");
  });

  test("oauth vendored with --provider-configuration records the config and a secret placeholder", async () => {
    const { projectRoot, cleanup } = await initProject();
    cleanups.push(cleanup);

    const { io } = await run([
      "add",
      "credentials",
      "oauth",
      "--name",
      "github",
      "--vendor",
      "GithubOauth2",
      "--provider-configuration",
      '{"githubOauth2ProviderConfig":{"clientId":"client-1"}}',
    ]);

    const agentcoreJson = await Bun.file(join(projectRoot, "agentcore", "agentcore.json")).json();
    expect(agentcoreJson.credentials).toEqual([
      {
        authorizerType: "OAuthCredentialProvider",
        name: "github",
        vendor: "GithubOauth2",
        providerConfig: { githubOauth2ProviderConfig: { clientId: "client-1" } },
      },
    ]);

    const env = await Bun.file(join(projectRoot, "agentcore", ".env.local")).text();
    expect(env).toContain("AGENTCORE_CREDENTIAL_GITHUB_CLIENT_SECRET=\n");
    expect(io.stderr()).toContain(
      "Set AGENTCORE_CREDENTIAL_GITHUB_CLIENT_SECRET in agentcore/.env.local before you deploy",
    );
  });

  test("preserves existing .env.local content and never overwrites an existing key", async () => {
    const { projectRoot, cleanup } = await initProject();
    cleanups.push(cleanup);
    const envPath = join(projectRoot, "agentcore", ".env.local");
    const original = await Bun.file(envPath).text();
    await Bun.write(envPath, `${original}AGENTCORE_CREDENTIAL_SVC_KEY=user-managed\n`);

    const { io } = await run(["add", "credentials", "api-key", "--name", "svc-key"]);

    const env = await Bun.file(envPath).text();
    expect(env).toStartWith(original);
    expect(env.match(/AGENTCORE_CREDENTIAL_SVC_KEY=/g)).toHaveLength(1);
    expect(env).toContain("AGENTCORE_CREDENTIAL_SVC_KEY=user-managed");
    expect(io.stderr()).toContain("already exists");
  });

  test("creates .env.local when the project lacks one", async () => {
    const { projectRoot, cleanup } = await initProject();
    cleanups.push(cleanup);
    const envPath = join(projectRoot, "agentcore", ".env.local");
    await rm(envPath);

    await run(["add", "credentials", "api-key", "--name", "svc-key"]);

    const env = await Bun.file(envPath).text();
    expect(env).toContain("AGENTCORE_CREDENTIAL_SVC_KEY=\n");
  });

  test("rejects a duplicate credential name across credential types", async () => {
    const { cleanup } = await initProject();
    cleanups.push(cleanup);
    await run(["add", "credentials", "api-key", "--name", "dup"]);
    await expect(
      run(["add", "credentials", "oauth", "--name", "dup", "--discovery-url", discoveryUrl]),
    ).rejects.toThrow(/already exists/);
  });

  test("rejects two names that derive the same environment variable", async () => {
    const { cleanup } = await initProject();
    cleanups.push(cleanup);
    await run(["add", "credentials", "api-key", "--name", "svc-key"]);
    await expect(run(["add", "credentials", "api-key", "--name", "svc_key"])).rejects.toThrow(
      /same environment variable/,
    );
  });

  test("rejects different credential types that collide on one secret variable", async () => {
    const { cleanup } = await initProject();
    cleanups.push(cleanup);
    // OAuth 'foo' → AGENTCORE_CREDENTIAL_FOO_CLIENT_SECRET; api-key 'foo_client_secret' → the same.
    await run(["add", "credentials", "oauth", "--name", "foo", "--discovery-url", discoveryUrl]);
    await expect(
      run(["add", "credentials", "api-key", "--name", "foo_client_secret"]),
    ).rejects.toThrow(/same environment variable/);
  });

  test("rejects a name ending in a field suffix even with nothing to collide with", async () => {
    const { cleanup } = await initProject();
    cleanups.push(cleanup);
    // Nothing in the spec derives AGENTCORE_CREDENTIAL_SVC_CLIENT_ID, but a pre-0.29
    // OAuth credential named 'svc' would read it as its client id.
    await expect(run(["add", "credentials", "api-key", "--name", "svc-client-id"])).rejects.toThrow(
      /_CLIENT_ID/,
    );
  });

  test.each<[string, string[], RegExp]>([
    [
      "api-key: an inline secret value",
      ["api-key", "--name", "x", "--api-key", "sk-inline"],
      /file:\/\//,
    ],
    ["api-key: a multi-line secret", ["api-key", "--name", "x", "--api-key", "-"], /single-line/],
    [
      "oauth: an inline secret value",
      ["oauth", "--name", "x", "--discovery-url", discoveryUrl, "--client-secret", "sssh"],
      /file:\/\//,
    ],
    [
      "api-key: a secret combined with a secret reference",
      [
        "api-key",
        "--name",
        "x",
        "--api-key",
        "-",
        "--api-key-secret-reference",
        '{"secretId":"arn:aws:secretsmanager:us-west-2:123:secret:s","jsonKey":"apiKey"}',
      ],
      /mutually exclusive/,
    ],
    [
      "oauth: a secret combined with a secret reference",
      [
        "oauth",
        "--name",
        "x",
        "--discovery-url",
        discoveryUrl,
        "--client-secret",
        "-",
        "--client-secret-reference",
        '{"secretId":"arn:aws:secretsmanager:us-west-2:123:secret:s","jsonKey":"clientSecret"}',
      ],
      /mutually exclusive/,
    ],
    ["api-key: a missing --name", ["api-key"], /--name/],
    ["oauth: a missing --name", ["oauth"], /--name/],
    [
      "oauth: a vendored provider without --provider-configuration",
      ["oauth", "--name", "x", "--vendor", "GithubOauth2"],
      /--provider-configuration/,
    ],
    [
      "oauth: a guided custom provider without --discovery-url",
      ["oauth", "--name", "x", "--client-id", "c"],
      /--discovery-url/,
    ],
    [
      "oauth: --provider-configuration combined with --scopes",
      [
        "oauth",
        "--name",
        "x",
        "--vendor",
        "GithubOauth2",
        "--provider-configuration",
        '{"githubOauth2ProviderConfig":{"clientId":"c"}}',
        "--scopes",
        "repo",
      ],
      /mutually exclusive/,
    ],
    [
      "oauth: secret material inside --provider-configuration",
      [
        "oauth",
        "--name",
        "x",
        "--vendor",
        "GithubOauth2",
        "--provider-configuration",
        '{"githubOauth2ProviderConfig":{"clientId":"c","clientSecret":"sssh"}}',
      ],
      /secret material/,
    ],
  ])("rejects %s", async (_label, args, message) => {
    const { cleanup } = await initProject();
    cleanups.push(cleanup);
    await expect(run(["add", "credentials", ...args], { stdin: "line1\nline2" })).rejects.toThrow(
      message,
    );
  });
});
