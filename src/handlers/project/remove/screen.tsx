import { Text } from "ink";
import { Navigate, useNavigate, useParams } from "react-router";
import { Layout } from "../../../components/Layout";
import { ConfirmAction } from "../../../components/ConfirmAction";
import { DataTable, type DataTableColumn } from "../../../components/ui/data-table";
import { ProjectKey } from "../../../router";
import type { ProjectSpec } from "../../../projectSchemas/project";
import type { ScreenProps } from "../../types";
import type { Project, RemoveResourceInput } from "../types";

/** Resources removed by name alone — the project's root-level collections. */
type RootLevelResource =
  | "runtime"
  | "harness"
  | "memory"
  | "credential"
  | "config-bundle"
  | "online-eval"
  | "gateway"
  | "policy-engine"
  | "payment-manager";

/** Every resource that can be removed, including the nested ones. */
type RemovableResourceType =
  RootLevelResource | "gateway-target" | "gateway-connector" | "policy" | "payment-connector";

/** A specific resource in the project, paired with the input that removes it. */
type RemovableResource = {
  name: string;
  /** The owning gateway/engine/manager, for nested resources. */
  parent?: string;
  input: RemoveResourceInput;
};

type RemovableResourceTypeInfo = {
  resourceType: RemovableResourceType;
  /** Column header for the parent, shown for nested resource types only. */
  parentLabel?: string;
  list: (spec: ProjectSpec) => RemovableResource[];
};

function rootLevel(
  resourceType: RootLevelResource,
  read: (spec: ProjectSpec) => { name: string }[],
): RemovableResourceTypeInfo {
  return {
    resourceType,
    list: (spec) => read(spec).map(({ name }) => ({ name, input: { resourceType, name } })),
  };
}

const REMOVABLE_RESOURCE_TYPES: RemovableResourceTypeInfo[] = [
  rootLevel("runtime", (s) => s.runtimes),
  rootLevel("harness", (s) => s.harnesses),
  rootLevel("memory", (s) => s.memories),
  rootLevel("credential", (s) => s.credentials),
  rootLevel("config-bundle", (s) => s.configBundles),
  rootLevel("online-eval", (s) => s.onlineEvalConfigs),
  rootLevel("gateway", (s) => s.agentCoreGateways),
  rootLevel("policy-engine", (s) => s.policyEngines),
  rootLevel("payment-manager", (s) => s.payments ?? []),
  {
    resourceType: "gateway-target",
    parentLabel: "gateway",
    list: (s) =>
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
    parentLabel: "gateway",
    list: (s) =>
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
    parentLabel: "engine",
    list: (s) =>
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
    parentLabel: "manager",
    list: (s) =>
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

const KEY_HINTS = [
  { key: "↑↓/jk", label: "navigate" },
  { key: "/", label: "filter" },
  { key: "enter", label: "select" },
  { key: "esc", label: "back" },
  { key: "ctl+c", label: "quit" },
];

export function ProjectRemoveScreen({ ctx, core }: ScreenProps) {
  const { resourceType, index } = useParams();
  const project = ctx.value(ProjectKey);

  if (!project) {
    return (
      <Layout breadcrumb={["agentcore", "project", "remove"]} keyHints={KEY_HINTS}>
        <Text color="red">No AgentCore project is loaded.</Text>
      </Layout>
    );
  }

  if (!resourceType) {
    return <ResourceTypePicker project={project} />;
  }

  if (resourceType === "all") {
    return <RemoveAllConfirm project={project} core={core} />;
  }

  const info = REMOVABLE_RESOURCE_TYPES.find((entry) => entry.resourceType === resourceType);
  if (!info) {
    return <Navigate to={REMOVE_ROOT} replace />;
  }

  if (index === undefined) {
    return <ResourcePicker project={project} info={info} />;
  }

  const resource = info.list(project.spec)[Number(index)];
  if (!resource) {
    return <Navigate to={`${REMOVE_ROOT}/${info.resourceType}`} replace />;
  }

  return <RemoveConfirm project={project} core={core} info={info} resource={resource} />;
}

type ResourceTypeRow = Record<string, unknown> & { resource: string; count: string; value: string };

const resourceTypeColumns = [
  { key: "resource", header: "resource", flex: true },
  { key: "count", header: "count", width: 8, align: "right" },
] satisfies DataTableColumn<ResourceTypeRow>[];

function ResourceTypePicker({ project }: { project: Project }) {
  const navigate = useNavigate();

  const rows: ResourceTypeRow[] = REMOVABLE_RESOURCE_TYPES.flatMap((info) => {
    const count = info.list(project.spec).length;
    if (count === 0) return [];
    return [{ resource: info.resourceType, count: String(count), value: info.resourceType }];
  });
  const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
  rows.push({ resource: "all", count: String(total), value: "all" });

  return (
    <Layout
      breadcrumb={["agentcore", "project", "remove"]}
      description={`choose a resource to remove from project ${project.name}`}
      keyHints={KEY_HINTS}
    >
      <DataTable
        borderStyle="none"
        showFooter={false}
        focus
        columns={resourceTypeColumns}
        data={rows}
        emptyMessage="This project has no resources to remove."
        onSelect={(row) => navigate(`${REMOVE_ROOT}/${row.value}`)}
        onEscape={() => navigate("/agentcore/project")}
      />
    </Layout>
  );
}

type ResourceRow = Record<string, unknown> & { index: string; name: string; parent: string };

function ResourcePicker({ project, info }: { project: Project; info: RemovableResourceTypeInfo }) {
  const navigate = useNavigate();
  const rows: ResourceRow[] = info.list(project.spec).map((resource, i) => ({
    index: String(i),
    name: resource.name,
    parent: resource.parent ?? "",
  }));
  const columns: DataTableColumn<ResourceRow>[] = info.parentLabel
    ? [
        { key: "parent", header: info.parentLabel, width: 24 },
        { key: "name", header: "name", flex: true },
      ]
    : [{ key: "name", header: "name", flex: true }];

  return (
    <Layout
      breadcrumb={["agentcore", "project", "remove", info.resourceType]}
      description={`choose a ${info.resourceType} to remove`}
      keyHints={KEY_HINTS}
    >
      <DataTable
        borderStyle="none"
        showFooter={false}
        focus
        columns={columns}
        data={rows}
        emptyMessage={`This project has no ${info.resourceType} resources.`}
        onSelect={(row) => navigate(`${REMOVE_ROOT}/${info.resourceType}/${row.index}`)}
        onEscape={() => navigate(REMOVE_ROOT)}
      />
    </Layout>
  );
}

function RemoveConfirm({
  project,
  core,
  info,
  resource,
}: {
  project: Project;
  core: ScreenProps["core"];
  info: RemovableResourceTypeInfo;
  resource: RemovableResource;
}) {
  const navigate = useNavigate();

  return (
    <ConfirmAction
      breadcrumb={["agentcore", "project", "remove", info.resourceType, resource.name]}
      title={resource.name}
      rows={[
        { label: "type", value: info.resourceType },
        ...(resource.parent
          ? [{ label: info.parentLabel ?? "parent", value: resource.parent }]
          : []),
        { label: "project", value: project.name },
      ]}
      message={`Remove ${info.resourceType} '${resource.name}' from project ${project.name}? This edits agentcore.json; deployed infrastructure is untouched until you deploy.`}
      isPending={false}
      error={null}
      action={async () => {
        const result = await core.projectManager.removeResource(project, resource.input);
        return [
          { label: "removed", value: `${info.resourceType} '${resource.name}'` },
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

  const populated = REMOVABLE_RESOURCE_TYPES.flatMap((info) => {
    const count = info.list(project.spec).length;
    return count === 0 ? [] : [{ label: info.resourceType, value: String(count) }];
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
