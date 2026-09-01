import { Text } from "ink";
import { Navigate, useNavigate, useParams } from "react-router";
import { Layout } from "../../../components/Layout";
import { ConfirmAction } from "../../../components/ConfirmAction";
import { DataTable, type DataTableColumn } from "../../../components/ui/data-table";
import { ProjectKey } from "../../../router";
import type { ProjectSpec } from "../../../projectSchemas/project";
import type { ScreenProps } from "../../types";
import type { Project, RemoveResourceInput } from "../types";

/** The resource types removed by name alone (RemoveResourceInput's first branch). */
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

/** Every removable resource type, including the nested ones. */
type RemovableTypeId =
  NameOnlyType | "gateway-target" | "gateway-connector" | "policy" | "payment-connector";

/** A specific resource in the project, paired with the input that removes it. */
interface RemovableResource {
  name: string;
  /** The owning gateway/engine/manager, for nested resources. */
  parent?: string;
  input: RemoveResourceInput;
}

/** A kind of resource the user can pick to remove (e.g. "runtime", "policy"). */
interface ResourceCategory {
  id: RemovableTypeId;
  /** Column header for the parent, shown for nested categories only. */
  parentLabel?: string;
  list: (spec: ProjectSpec) => RemovableResource[];
}

function nameOnly(
  id: NameOnlyType,
  read: (spec: ProjectSpec) => { name: string }[],
): ResourceCategory {
  return {
    id,
    list: (spec) => read(spec).map(({ name }) => ({ name, input: { resourceType: id, name } })),
  };
}

const CATEGORIES: ResourceCategory[] = [
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
    id: "gateway-target",
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
    id: "gateway-connector",
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
    id: "policy",
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
    id: "payment-connector",
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
    return <CategoryPicker project={project} />;
  }

  if (resourceType === "all") {
    return <RemoveAllConfirm project={project} core={core} />;
  }

  const category = CATEGORIES.find((entry) => entry.id === resourceType);
  if (!category) {
    return <Navigate to={REMOVE_ROOT} replace />;
  }

  if (index === undefined) {
    return <ResourcePicker project={project} category={category} />;
  }

  const resource = category.list(project.spec)[Number(index)];
  if (!resource) {
    return <Navigate to={`${REMOVE_ROOT}/${category.id}`} replace />;
  }

  return <RemoveConfirm project={project} core={core} category={category} resource={resource} />;
}

type CategoryRow = Record<string, unknown> & { resource: string; count: string; value: string };

const categoryColumns = [
  { key: "resource", header: "resource", flex: true },
  { key: "count", header: "count", width: 8, align: "right" },
] satisfies DataTableColumn<CategoryRow>[];

function CategoryPicker({ project }: { project: Project }) {
  const navigate = useNavigate();

  const rows: CategoryRow[] = CATEGORIES.flatMap((category) => {
    const count = category.list(project.spec).length;
    if (count === 0) return [];
    return [{ resource: category.id, count: String(count), value: category.id }];
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
        columns={categoryColumns}
        data={rows}
        emptyMessage="This project has no resources to remove."
        onSelect={(row) => navigate(`${REMOVE_ROOT}/${row.value}`)}
        onEscape={() => navigate("/agentcore/project")}
      />
    </Layout>
  );
}

type ResourceRow = Record<string, unknown> & { index: string; name: string; parent: string };

function ResourcePicker({ project, category }: { project: Project; category: ResourceCategory }) {
  const navigate = useNavigate();
  const rows: ResourceRow[] = category.list(project.spec).map((resource, i) => ({
    index: String(i),
    name: resource.name,
    parent: resource.parent ?? "",
  }));
  const columns: DataTableColumn<ResourceRow>[] = category.parentLabel
    ? [
        { key: "parent", header: category.parentLabel, width: 24 },
        { key: "name", header: "name", flex: true },
      ]
    : [{ key: "name", header: "name", flex: true }];

  return (
    <Layout
      breadcrumb={["agentcore", "project", "remove", category.id]}
      description={`choose a ${category.id} to remove`}
      keyHints={KEY_HINTS}
    >
      <DataTable
        borderStyle="none"
        showFooter={false}
        focus
        columns={columns}
        data={rows}
        emptyMessage={`This project has no ${category.id} resources.`}
        onSelect={(row) => navigate(`${REMOVE_ROOT}/${category.id}/${row.index}`)}
        onEscape={() => navigate(REMOVE_ROOT)}
      />
    </Layout>
  );
}

function RemoveConfirm({
  project,
  core,
  category,
  resource,
}: {
  project: Project;
  core: ScreenProps["core"];
  category: ResourceCategory;
  resource: RemovableResource;
}) {
  const navigate = useNavigate();

  return (
    <ConfirmAction
      breadcrumb={["agentcore", "project", "remove", category.id, resource.name]}
      title={resource.name}
      rows={[
        { label: "type", value: category.id },
        ...(resource.parent
          ? [{ label: category.parentLabel ?? "parent", value: resource.parent }]
          : []),
        { label: "project", value: project.name },
      ]}
      message={`Remove ${category.id} '${resource.name}' from project ${project.name}? This edits agentcore.json; deployed infrastructure is untouched until you deploy.`}
      isPending={false}
      error={null}
      action={async () => {
        const result = await core.projectManager.removeResource(project, resource.input);
        return [
          { label: "removed", value: `${category.id} '${resource.name}'` },
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

  const populated = CATEGORIES.flatMap((category) => {
    const count = category.list(project.spec).length;
    return count === 0 ? [] : [{ label: category.id, value: String(count) }];
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
