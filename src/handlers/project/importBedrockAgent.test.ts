import { describe, expect, test } from "bun:test";
import type {
  BedrockAgentImportPlan,
  BedrockAgentImportRequest,
  CoreBedrockAgentImporter,
} from "../../core/project/bedrockAgentImport";
import { InputValidationError } from "../../errors";
import { importScaffoldRuntimeInput, resolveImportBedrockAgentInput } from "./importBedrockAgent";

const plan: BedrockAgentImportPlan = {
  framework: "strands",
  sourceAgentId: "A1B2C3D4E5",
  sourceAgentAliasId: "TSTALIASID",
  sourceAgentVersion: "7",
  files: {
    "main.py": "app = object()",
    "pyproject.toml": "[project]",
    "IMPORT_NOTES.md": "# Notes\n",
  },
  notes: [],
};

function importer(): {
  importer: CoreBedrockAgentImporter;
  calls: BedrockAgentImportRequest[];
} {
  const calls: BedrockAgentImportRequest[] = [];
  return {
    calls,
    importer: {
      import: async (input) => {
        calls.push(input);
        return plan;
      },
    },
  };
}

describe("resolveImportBedrockAgentInput", () => {
  test("forwards the alias-pinned translation request", async () => {
    const subject = importer();

    const result = await resolveImportBedrockAgentInput({
      importer: subject.importer,
      runtimeName: "support",
      region: "us-east-1",
      agentId: "A1B2C3D4E5",
      agentAliasId: "TSTALIASID",
      framework: "strands",
      memory: "longAndShortTerm",
    });

    expect(result).toBe(plan);
    expect(subject.calls).toEqual([
      {
        runtimeName: "support",
        region: "us-east-1",
        agentId: "A1B2C3D4E5",
        agentAliasId: "TSTALIASID",
        framework: "strands",
        memory: "longAndShortTerm",
      },
    ]);
  });

  test("requires both source identifiers before calling the importer", async () => {
    const subject = importer();

    await expect(
      resolveImportBedrockAgentInput({
        importer: subject.importer,
        runtimeName: "support",
        region: "us-east-1",
        agentId: "A1B2C3D4E5",
        framework: "strands",
        memory: "none",
      }),
    ).rejects.toBeInstanceOf(InputValidationError);
    expect(subject.calls).toEqual([]);
  });
});

describe("importScaffoldRuntimeInput", () => {
  test("uses the fixed Python CodeZip runtime shape with no memory", () => {
    expect(importScaffoldRuntimeInput("support")).toEqual({
      runtimeName: "support",
      build: "CodeZip",
      language: "Python",
      framework: "none",
      modelProvider: "Bedrock",
      memory: undefined,
      runtimeVersion: "PYTHON_3_14",
    });
  });
});
