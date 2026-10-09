"""Inspect deploy telemetry from the compiled CLI without creating AWS resources."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory


binary = shutil.which(sys.argv[1])
assert binary, "Compile the CLI and put its dist/bin directory on PATH."
binary = str(Path(binary).resolve())
config_path = Path.home() / ".agentcore" / "config.json"
original_config = config_path.read_bytes() if config_path.exists() else None
audit_directory = config_path.parent / "telemetry"
environment = {**os.environ, "AGENTCORE_TELEMETRY_DISABLED": "1", "FORCE_COLOR": "0"}


def run(arguments, directory, expected_exit=0):
    print(f"> {Path(binary).name} {' '.join(arguments)}", flush=True)
    result = subprocess.run(
        [binary, *arguments],
        cwd=directory,
        env=environment,
        capture_output=True,
        text=True,
    )
    output = result.stdout + result.stderr
    print(output.replace(str(directory), "<fixture>"), end="", flush=True)
    assert result.returncode == expected_exit, result.returncode


def inspect_deploy(directory, expected_counts):
    previous_audits = set(audit_directory.glob("*.jsonl"))
    # An unknown target fails before AWS operations but after project counts are recorded.
    run(["deploy", "--target", "missing", "--json", "--region", "us-east-1"], directory, 1)
    new_audits = set(audit_directory.glob("*.jsonl")) - previous_audits
    assert len(new_audits) == 1
    audit = json.loads(new_audits.pop().read_text())
    assert audit["metricName"] == "cli.command_run"
    assert audit["attrs"]["command_path"] == "/agentcore/deploy"
    assert audit["attrs"]["exit_reason"] == "failure"
    actual_counts = {
        key: value for key, value in audit["attrs"].items() if key.startswith("project_")
    }
    assert actual_counts == expected_counts, actual_counts
    print(json.dumps(actual_counts, indent=2), flush=True)


try:
    config = json.loads(original_config) if original_config is not None else {}
    config["telemetry"] = {**config.get("telemetry", {}), "audit": True}
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(config))
    with TemporaryDirectory(prefix="deploy-telemetry-demo-") as temporary:
        directory = Path(temporary)
        run(
            [
                "create", "--name", "TelemetryDemo", "--template", "empty",
                "--skip-install", "--skip-git", "--region", "us-east-1",
            ],
            directory,
        )
        project_root = directory / "TelemetryDemo"
        (project_root / "agentcore" / "aws-targets.json").write_text(json.dumps([{
            "name": "default", "account": "111122223333", "region": "us-east-1",
        }]))
        spec_path = project_root / "agentcore" / "agentcore.json"
        resource_types = [
            "runtime", "memory", "knowledge_base", "credential", "evaluator",
            "online_eval_config", "gateway", "tool_runtime", "policy_engine",
            "config_bundle", "harness", "payment_manager", "gateway_target",
            "policy", "runtime_endpoint", "payment_connector",
            "memory_strategy", "knowledge_base_data_source",
        ]
        empty_counts = {f"project_{resource}_count": 0 for resource in resource_types}
        print("Empty project:", flush=True)
        inspect_deploy(project_root, empty_counts)
        spec = json.loads(spec_path.read_text())
        spec.update({
            "runtimes": [{
                "name": "Agent", "build": "CodeZip", "entrypoint": "main.py",
                "codeLocation": "app/agent", "runtimeVersion": "PYTHON_3_12",
                "endpoints": {"LIVE": {"version": 1}, "STAGING": {"version": 2}},
            }],
            "memories": [{
                "name": "Memory", "eventExpiryDuration": 30,
                "strategies": [{"type": "SEMANTIC"}],
            }],
            "knowledgeBases": [{
                "name": "Knowledge",
                "dataSources": [{"type": "S3", "uri": "s3://test-bucket/documents"}],
            }],
            "agentCoreGateways": [{
                "name": "Gateway", "protocolType": "None",
                "targets": [{
                    "name": "Target", "targetType": "httpRuntime",
                    "httpRuntime": {"runtime": "Agent"},
                }],
            }],
            "policyEngines": [{
                "name": "Engine",
                "policies": [{"name": "Policy", "statement": "permit(principal, action, resource);"}],
            }],
            "payments": [{
                "name": "Payments",
                "connectors": [{
                    "name": "Connector", "provider": "CoinbaseCDP",
                    "provisionMode": "QUICK_CREATE",
                }],
            }],
        })
        spec_path.write_text(json.dumps(spec))
        populated_counts = {
            **empty_counts,
            **{f"project_{resource}_count": 1 for resource in [
                "runtime", "memory", "gateway", "policy_engine", "payment_manager",
                "gateway_target", "policy", "payment_connector", "knowledge_base",
                "memory_strategy", "knowledge_base_data_source",
            ]},
            "project_runtime_endpoint_count": 2,
        }
        print("Populated project with nested resources:", flush=True)
        inspect_deploy(project_root, populated_counts)
        print("PASS: compiled CLI emits all 18 counts, including explicit zeros.", flush=True)
finally:
    if original_config is None:
        config_path.unlink(missing_ok=True)
    else:
        config_path.write_bytes(original_config)
