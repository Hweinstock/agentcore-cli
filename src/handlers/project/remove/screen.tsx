import { Text } from "ink";
import { Navigate, useNavigate, useParams } from "react-router";
import { Layout } from "../../../components/Layout";
import { ConfirmAction } from "../../../components/ConfirmAction";
import { StaticTablePicker } from "../../../components/StaticTablePicker";
import type { DataTableColumn } from "../../../components/ui/data-table";
import { ProjectKey } from "../../../router";
import type { ProjectSpec } from "../../../projectSchemas/project";
import type { ScreenProps } from "../../types";
import type { Project, RemoveResourceInput } from "../types";

// A single removable resource: its display name, the parent it belongs to (for
// nested resources), and the input that removes it.
interface RemovableResource {
  name: string;
  parent?: string;
  input: RemoveResourceInput;
}

// A removable resource type shown in the picker: how to label it, what to head
// the parent column with (nested types only), and how to read its resources
// off the project spec.
interface RemovableType {
  resourceType: string;
  label: string;
  parentLabel?: string;
  getNamedFromSpec: (spec: ProjectSpec) => RemovableResource[];
}

// The resource types removed by name alone (RemoveResourceInput's first branch).
type NameOnlyType =
  | "runtime"
  | "harness"
  | "memory"
  | "credential"
  | "config-bundle"
  | "online-eval"
  | "gateway"
  | "policy-engine"
  | "payment-manager";

// nameOnly builds a type whose resources are removed by name alone.
function nameOnly(
  resourceType: NameOnlyType,
  read: (spec: ProjectSpec) => { name: string }[],
): RemovableType {
  return {
    resourceType,
    label: resourceType,
    getNamedFromSpec: (spec) =>
      read(spec).map(({ name }) => ({ name, input: { resourceType, name } })),
  };
}

const REMOVABLE_TYPES: RemovableType[] = [
  nameOnly("runtime", (s) => s.runtimes),
  nameOnly("harness", (s) => s.harnesses),
  nameOnly("memory", (s) => s.memories),
  nameOnly("credential", (s) => s.credentials),
  nameOnly("config-bundle", (s) => s.configBundles),
  nameOnly("online-eval", (s) => s.onlineEvalConfigs),
  nameOnly("gateway", (s) => s.agentCoreGateways),
  nameOnly("policy-engine", (s) => s.policyEngines),
  nameOnly("payment-manager", (s) => s.payments ?? []),
  {
    resourceType: "gateway-target",
    label: "gateway-target",
    parentLabel: "gateway",
    getNamedFromSpec: (s) =>
      s.agentCoreGateways.flatMap((gateway) =>
        gateway.targets
          .filter((target) => target.targetType !== "connector")
          .map((target) => ({
            name: target.name,
            parent: gateway.name,
            input: { resourceType: "gateway-target", gatewayName: gateway.name, name: target.name },
          })),
      ),
  },
  {
    resourceType: "gateway-connector",
    label: "gateway-connector",
    parentLabel: "gateway",
    getNamedFromSpec: (s) =>
      s.agentCoreGateways.flatMap((gateway) =>
        gateway.targets
          .filter((target) => target.targetType === "connector")
          .map((target) => ({
            name: target.name,
            parent: gateway.name,
            input: { resourceType: "gateway-target", gatewayName: gateway.name, name: target.name },
          })),
      ),
  },
  {
    resourceType: "policy",
    label: "policy",
    parentLabel: "engine",
    getNamedFromSpec: (s) =>
      s.policyEngines.flatMap((engine) =>
        engine.policies.map((policy) => ({
          name: policy.name,
          parent: engine.name,
          input: { resourceType: "policy", engineName: engine.name, name: policy.name },
        })),
      ),
  },
  {
    resourceType: "payment-connector",
    label: "payment-connector",
    parentLabel: "manager",
    getNamedFromSpec: (s) =>
      (s.payments ?? []).flatMap((manager) =>
        manager.connectors.map((connector) => ({
          name: connector.name,
          parent: manager.name,
          input: {
            resourceType: "payment-connector",
            managerName: manager.name,
            name: connector.name,
          },
        })),
      ),
  },
];

const REMOVE_ROOT = "/agentcore/project/remove";

export function ProjectRemoveScreen({ ctx, core }: ScreenProps) {
  const { resourceType, index } = useParams();
  const project = ctx.value(ProjectKey);

  if (!project) {
    return (
      <Layout
        breadcrumb={["agentcore", "project", "remove"]}
        description="no project loaded"
        keyHints={[
          { key: "esc", label: "back" },
          { key: "ctl+c", label: "quit" },
        ]}
      >
        <Text color="red">No AgentCore project is loaded.</Text>
      </Layout>
    );
  }

  if (!resourceType) {
    return <TypePicker project={project} />;
  }

  if (resourceType === "all") {
    return <RemoveAllConfirm project={project} core={core} />;
  }

  const type = REMOVABLE_TYPES.find((entry) => entry.resourceType === resourceType);
  if (!type) {
    return <Navigate to={REMOVE_ROOT} replace />;
  }

  if (index === undefined) {
    return <ResourcePicker project={project} type={type} />;
  }

  const resource = type.getNamedFromSpec(project.spec)[Number(index)];
  if (!resource) {
    return <Navigate to={`${REMOVE_ROOT}/${type.resourceType}`} replace />;
  }

  return <RemoveConfirm project={project} core={core} type={type} resource={resource} />;
}

type TypeRow = Record<string, unknown> & { type: string; count: string; value: string };

const typeColumns = [
  { key: "type", header: "type", flex: true },
  { key: "count", header: "count", width: 8, align: "right" },
] satisfies DataTableColumn<TypeRow>[];

function TypePicker({ project }: { project: Project }) {
  const navigate = useNavigate();

  const rows: TypeRow[] = REMOVABLE_TYPES.flatMap((entry) => {
    const count = entry.getNamedFromSpec(project.spec).length;
    if (count === 0) return [];
    return [{ type: entry.label, count: String(count), value: entry.resourceType }];
  });
  rows.push({ type: "all", count: "", value: "all" });

  return (
    <StaticTablePicker
      breadcrumb={["agentcore", "project", "remove"]}
      description={`choose a resource to remove from project ${project.name}`}
      columns={typeColumns}
      rows={rows}
      emptyMessage="This project has no resources to remove."
      onSelect={(row) => navigate(`${REMOVE_ROOT}/${row.value}`)}
      onBack={() => navigate("/agentcore/project")}
    />
  );
}

type ResourceRow = Record<string, unknown> & { index: string; name: string; parent: string };

function ResourcePicker({ project, type }: { project: Project; type: RemovableType }) {
  const navigate = useNavigate();
  const rows: ResourceRow[] = type.getNamedFromSpec(project.spec).map((resource, i) => ({
    index: String(i),
    name: resource.name,
    parent: resource.parent ?? "",
  }));
  const columns: DataTableColumn<ResourceRow>[] = type.parentLabel
    ? [
        { key: "parent", header: type.parentLabel, width: 24 },
        { key: "name", header: "name", flex: true },
      ]
    : [{ key: "name", header: "name", flex: true }];

  return (
    <StaticTablePicker
      breadcrumb={["agentcore", "project", "remove", type.label]}
      description={`choose a ${type.label} to remove`}
      columns={columns}
      rows={rows}
      emptyMessage={`This project has no ${type.label} resources.`}
      onSelect={(row) => navigate(`${REMOVE_ROOT}/${type.resourceType}/${row.index}`)}
      onBack={() => navigate(REMOVE_ROOT)}
    />
  );
}

function RemoveConfirm({
  project,
  core,
  type,
  resource,
}: {
  project: Project;
  core: ScreenProps["core"];
  type: RemovableType;
  resource: RemovableResource;
}) {
  const navigate = useNavigate();

  return (
    <ConfirmAction
      breadcrumb={["agentcore", "project", "remove", type.label, resource.name]}
      title={resource.name}
      rows={[
        { label: "type", value: type.label },
        ...(resource.parent
          ? [{ label: type.parentLabel ?? "parent", value: resource.parent }]
          : []),
        { label: "project", value: project.name },
      ]}
      message={`Remove ${type.label} '${resource.name}' from project ${project.name}? This edits agentcore.json; deployed infrastructure is untouched until you deploy.`}
      isPending={false}
      error={null}
      action={async () => {
        const result = await core.projectManager.removeResource(project, resource.input);
        return [
          { label: "removed", value: `${type.label} '${resource.name}'` },
          ...result.removedEnvKeys.map((key) => ({ label: "env", value: `removed ${key}` })),
        ];
      }}
      successTitle="Resource removed"
      runningLabel="Removing resource…"
      onDone={() => navigate("/agentcore/project")}
    />
  );
}

function RemoveAllConfirm({ project, core }: { project: Project; core: ScreenProps["core"] }) {
  const navigate = useNavigate();

  const populated = REMOVABLE_TYPES.flatMap((entry) => {
    const count = entry.getNamedFromSpec(project.spec).length;
    return count === 0 ? [] : [{ label: entry.label, value: String(count) }];
  });

  return (
    <ConfirmAction
      breadcrumb={["agentcore", "project", "remove", "all"]}
      title={project.name}
      rows={populated.length > 0 ? populated : [{ label: "resources", value: "none" }]}
      message={`Remove every resource from project ${project.name}? This empties each resource collection in agentcore.json; code under app/ is kept.`}
      isPending={false}
      error={null}
      action={async () => {
        const result = await core.projectManager.removeAllResources(project);
        return [
          { label: "removed", value: "all resources" },
          ...result.removedEnvKeys.map((key) => ({ label: "env", value: `removed ${key}` })),
        ];
      }}
      successTitle="All resources removed"
      runningLabel="Removing all resources…"
      onDone={() => navigate("/agentcore/project")}
    />
  );
}
