# Test Structure

## Principles

All tests follow a 1:1 mapping convention to keep ownership and coverage clear.

## Unit Tests

Located in `src/` alongside source files (`*.test.ts`). Each test file maps 1:1 with the source file it covers.

## Integration Tests

Located in `test/integ-tests/`. Each file maps 1:1 with a command, nested in folders with clear ownership boundaries.

```
integ-tests/
    add/
        memory.test.ts
        gateway.test.ts
        agent.test.ts
    remove/
        memory.test.ts
        gateway.test.ts
        agent.test.ts
    create/
        with-agent.test.ts
        no-agent.test.ts
    dev/
        ...
    deploy/
        ...
```

## E2E Tests

Located in `test/e2e-tests/`. Each file maps 1:1 with a feature or smoke-tests a full lifecycle (create → dev → deploy →
invoke) for a specific combination.

```
e2e-tests/
    framework-provider.test.ts     # smoke tests across framework/provider combos
    payments.test.ts               # deploying payment resources
    byo-filesystem.test.ts         # deploying agents with BYO filesystem
```
