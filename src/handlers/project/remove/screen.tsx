import { useQuery } from "@tanstack/react-query";
import { Text } from "ink";
import { useNavigate, useParams } from "react-router";
import { Layout } from "../../../components/Layout";
import { ConfirmAction } from "../../../components/ConfirmAction";
import { DataTable, type DataTableColumn } from "../../../components/ui/data-table";
import { Spinner } from "../../../components/ui/spinner";
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
  /** Name of the owning gateway/engine/manager, for nested resources. */
  parentName?: string;
  input: RemoveResourceInput;
};

/** Config for listing a resource type's resources and rendering them as a table. */
type RemovableResourceTableConfig = {
  resourceType: RemovableResourceType;
  /** Column header for the parent, shown for nested resource types only. */
  parentLabel?: string;
  list: (spec: ProjectSpec) => RemovableResource[];
};

function rootLevel(
  resourceType: RootLevelResource,
  read: (spec: ProjectSpec) => { name: string }[],
): RemovableResourceTableConfig {
  return {
    resourceType,
    list: (spec) => read(spec).map(({ name }) => ({ name, input: { resourceType, name } })),
  };
}

const RESOURCE_TABLES: RemovableResourceTableConfig[] = [
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
            parentName: gateway.name,
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
            parentName: gateway.name,
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
          parentName: engine.name,
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
          parentName: manager.name,
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
  const { resourceType, resourceIndex } = useParams();

  // The project is pinned on the context when `remove` runs as a command, but
  // not when this screen is reached by navigating within the root TUI; resolve
  // from the working directory in that case (mirrors project invoke).
  const pinned = ctx.value(ProjectKey);
  const cwd = process.cwd();
  const resolved = useQuery({
    queryKey: ["project", "remove", cwd],
    queryFn: async () => (await core.projectManager.resolve({ filePath: cwd })) ?? null,
    enabled: !pinned,
  });
  const project = pinned ?? resolved.data ?? undefined;

  if (!project) {
    const message =
      !pinned && resolved.isPending
        ? undefined
        : resolved.isError
          ? (resolved.error as Error).message
          : `No AgentCore project found at ${cwd} or any parent directory ` +
            `(looked for agentcore/agentcore.json). Run 'agentcore project create' to scaffold one.`;
    return (
      <Layout breadcrumb={["agentcore", "project", "remove"]} keyHints={KEY_HINTS}>
        {message === undefined ? (
          <Spinner label="Resolving project…" />
        ) : (
          <Text color="red">{message}</Text>
        )}
      </Layout>
    );
  }

  if (!resourceType) {
    return <ResourceTypePicker project={project} />;
  }

  if (resourceType === "all") {
    return <RemoveAllConfirm project={project} core={core} />;
  }

  // Fall back to the resource-type selection screen on an unrecognized type.
  const table = RESOURCE_TABLES.find((entry) => entry.resourceType === resourceType);
  if (!table) {
    return <ResourceTypePicker project={project} />;
  }

  // resourceIndex points into the same list() the picker rendered; a specific
  // resource confirms, otherwise show the list.
  if (resourceIndex !== undefined) {
    const resource = table.list(project.spec)[Number(resourceIndex)];
    if (resource) {
      return <RemoveConfirm project={project} core={core} table={table} resource={resource} />;
    }
  }

  return <ResourcePicker project={project} table={table} />;
}

type ResourceTypeRow = Record<string, unknown> & { resource: string; count: string; value: string };

const resourceTypeColumns = [
  { key: "resource", header: "resource", flex: true },
  { key: "count", header: "count", width: 8, align: "right" },
] satisfies DataTableColumn<ResourceTypeRow>[];

function ResourceTypePicker({ project }: { project: Project }) {
  const navigate = useNavigate();

  const rows: ResourceTypeRow[] = RESOURCE_TABLES.flatMap((table) => {
    const count = table.list(project.spec).length;
    if (count === 0) return [];
    return [{ resource: table.resourceType, count: String(count), value: table.resourceType }];
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

function ResourcePicker({
  project,
  table,
}: {
  project: Project;
  table: RemovableResourceTableConfig;
}) {
  const navigate = useNavigate();
  const rows: ResourceRow[] = table.list(project.spec).map((resource, i) => ({
    index: String(i),
    name: resource.name,
    parent: resource.parentName ?? "",
  }));
  const columns: DataTableColumn<ResourceRow>[] = table.parentLabel
    ? [
        { key: "parent", header: table.parentLabel, width: 24 },
        { key: "name", header: "name", flex: true },
      ]
    : [{ key: "name", header: "name", flex: true }];

  return (
    <Layout
      breadcrumb={["agentcore", "project", "remove", table.resourceType]}
      description={`choose a ${table.resourceType} to remove`}
      keyHints={KEY_HINTS}
    >
      <DataTable
        borderStyle="none"
        showFooter={false}
        focus
        columns={columns}
        data={rows}
        emptyMessage={`This project has no ${table.resourceType} resources.`}
        onSelect={(row) => navigate(`${REMOVE_ROOT}/${table.resourceType}/${row.index}`)}
        onEscape={() => navigate(REMOVE_ROOT)}
      />
    </Layout>
  );
}

function RemoveConfirm({
  project,
  core,
  table,
  resource,
}: {
  project: Project;
  core: ScreenProps["core"];
  table: RemovableResourceTableConfig;
  resource: RemovableResource;
}) {
  const navigate = useNavigate();

  return (
    <ConfirmAction
      breadcrumb={["agentcore", "project", "remove", table.resourceType, resource.name]}
      title={resource.name}
      rows={[
        { label: "type", value: table.resourceType },
        ...(resource.parentName
          ? [{ label: table.parentLabel ?? "parent", value: resource.parentName }]
          : []),
        { label: "project", value: project.name },
      ]}
      message={`Remove ${table.resourceType} '${resource.name}' from project ${project.name}? This edits agentcore.json; deployed infrastructure is untouched until you deploy.`}
      isPending={false}
      error={null}
      action={async () => {
        const result = await core.projectManager.removeResource(project, resource.input);
        return [
          { label: "removed", value: `${table.resourceType} '${resource.name}'` },
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

  const populated = RESOURCE_TABLES.flatMap((table) => {
    const count = table.list(project.spec).length;
    return count === 0 ? [] : [{ label: table.resourceType, value: String(count) }];
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
