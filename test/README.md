# End-to-end tests

The suite deploys and invokes real AgentCore resources. Run it with credentials for a test account:

```sh
ada credentials update --account <dev-account> --role Admin --once
export AWS_REGION=us-east-1
bun run test:e2e
```

Run one file with:

```sh
E2E_TEST_PATH=test/project/runtime.test.ts bun run test:e2e
```
