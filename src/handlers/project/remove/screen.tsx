import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Text, useInput } from "ink";
import { useNavigate, useParams } from "react-router";
import { Layout } from "../../../components/Layout";
import { ConfirmAction } from "../../../components/ConfirmAction";
import { DataTable, type DataTableColumn } from "../../../components/ui/data-table";
import { Spinner } from "../../../components/ui/spinner";
import { ProjectKey } from "../../../router";
import type { ProjectSpec } from "../../../projectSchemas/project";
import type { Project, RemoveResourceInput } from "../types";
import type { ScreenProps } from "../../types";

/** Resource categories removed by name alone — the project's root-level collections. */
type RootResourceCategory =
  | "runtime"
  | "harness"
  | "memory"
  | "credential"
  | "config-bundle"
  | "online-eval"
  | "gateway"
  | "policy-engine"
  | "payment-manager";

/** Every resource category the picker offers, including the nested ones. */
type RemovableResourceCategory =
  RootResourceCategory | "gateway-target" | "gateway-connector" | "policy" | "payment-connector";

/** A specific resource in the project, paired with the input that removes it. */
type RemovableResource = {
  name: string;
  /** Name of the owning gateway/engine/manager, for nested resources. */
  parentName?: string;
  removeInput: RemoveResourceInput;
};

/** How one resource category is identified, listed, and labeled in the picker. */
type RemovableResourceCategoryConfig = {
  category: RemovableResourceCategory;
  /** Column header for the parent, shown for nested categories only. */
  parentColumnLabel?: string;
  listResources: (spec: ProjectSpec) => RemovableResource[];
};

function rootCategory(
  category: RootResourceCategory,
  readCollection: (spec: ProjectSpec) => { name: string }[],
): RemovableResourceCategoryConfig {
  return {
    category,
    listResources: (spec) =>
      readCollection(spec).map(({ name }) => ({
        name,
        removeInput: { resourceType: category, name },
      })),
  };
}

const RESOURCE_CATEGORY_CONFIGS: RemovableResourceCategoryConfig[] = [
  rootCategory("runtime", (spec) => spec.runtimes),
  rootCategory("harness", (spec) => spec.harnesses),
  rootCategory("memory", (spec) => spec.memories),
  rootCategory("credential", (spec) => spec.credentials),
  rootCategory("config-bundle", (spec) => spec.configBundles),
  rootCategory("online-eval", (spec) => spec.onlineEvalConfigs),
  rootCategory("gateway", (spec) => spec.agentCoreGateways),
  rootCategory("policy-engine", (spec) => spec.policyEngines),
  rootCategory("payment-manager", (spec) => spec.payments ?? []),
  {
    category: "gateway-target",
    parentColumnLabel: "gateway",
    listResources: (spec) =>
      spec.agentCoreGateways.flatMap((gateway) =>
        gateway.targets
          .filter((target) => target.targetType !== "connector")
          .map((target) => ({
            name: target.name,
            parentName: gateway.name,
            removeInput: {
              resourceType: "gateway-target",
              gatewayName: gateway.name,
              name: target.name,
            },
          })),
      ),
  },
  {
    category: "gateway-connector",
    parentColumnLabel: "gateway",
    listResources: (spec) =>
      spec.agentCoreGateways.flatMap((gateway) =>
        gateway.targets
          .filter((target) => target.targetType === "connector")
          .map((target) => ({
            name: target.name,
            parentName: gateway.name,
            removeInput: {
              resourceType: "gateway-target",
              gatewayName: gateway.name,
              name: target.name,
            },
          })),
      ),
  },
  {
    category: "policy",
    parentColumnLabel: "policy engine",
    listResources: (spec) =>
      spec.policyEngines.flatMap((policyEngine) =>
        policyEngine.policies.map((policy) => ({
          name: policy.name,
          parentName: policyEngine.name,
          removeInput: { resourceType: "policy", engineName: policyEngine.name, name: policy.name },
        })),
      ),
  },
  {
    category: "payment-connector",
    parentColumnLabel: "payment manager",
    listResources: (spec) =>
      (spec.payments ?? []).flatMap((paymentManager) =>
        paymentManager.connectors.map((connector) => ({
          name: connector.name,
          parentName: paymentManager.name,
          removeInput: {
            resourceType: "payment-connector",
            managerName: paymentManager.name,
            name: connector.name,
          },
        })),
      ),
  },
];

const REMOVE_ROOT = "/agentcore/project/remove";

const makeProjectQueryKey = (workingDirectory: string) =>
  ["project", "remove", workingDirectory] as const;

const KEY_HINTS = [
  { key: "↑↓/jk", label: "navigate" },
  { key: "/", label: "filter" },
  { key: "enter", label: "select" },
  { key: "esc", label: "back" },
  { key: "ctl+c", label: "quit" },
];

export function ProjectRemoveScreen({ ctx, core }: ScreenProps) {
  const { category, resourceIndex } = useParams();
  const navigate = useNavigate();

  const projectFromContext = ctx.value(ProjectKey);
  const workingDirectory = process.cwd();
  const projectQuery = useQuery({
    queryKey: makeProjectQueryKey(workingDirectory),
    queryFn: async () =>
      (await core.projectManager.resolve({ filePath: workingDirectory })) ?? null,
  });
  const project = projectQuery.data ?? projectFromContext ?? undefined;

  // explicitly wire esc for the no project found case
  useInput(
    (_input, key) => {
      if (key.escape) navigate("/agentcore/project");
    },
    { isActive: !project },
  );

  if (!project) {
    return (
      <Layout breadcrumb={["agentcore", "project", "remove"]} keyHints={KEY_HINTS}>
        <NoProjectBody
          isPending={projectQuery.isPending}
          error={projectQuery.error}
          workingDirectory={workingDirectory}
        />
      </Layout>
    );
  }

  if (category === "all") {
    return <RemoveAllConfirm project={project} core={core} />;
  }

  // No category selected, or an unrecognized one: show the category picker.
  const categoryConfig = RESOURCE_CATEGORY_CONFIGS.find(
    (candidate) => candidate.category === category,
  );
  if (!categoryConfig) {
    return <ResourceCategoryPicker project={project} />;
  }

  if (resourceIndex !== undefined) {
    const resource = categoryConfig.listResources(project.spec)[Number(resourceIndex)];
    if (resource) {
      return (
        <RemoveConfirm
          project={project}
          core={core}
          categoryConfig={categoryConfig}
          resource={resource}
        />
      );
    }
  }

  return <ResourcePicker project={project} categoryConfig={categoryConfig} />;
}

function NoProjectBody({
  isPending,
  error,
  workingDirectory,
}: {
  isPending: boolean;
  error: unknown;
  workingDirectory: string;
}) {
  if (isPending) {
    return <Spinner label="Resolving project…" />;
  }
  if (error) {
    return <Text color="red">{(error as Error).message}</Text>;
  }
  return (
    <Text color="red">
      {`No AgentCore project found at ${workingDirectory} or any parent directory ` +
        `(looked for agentcore/agentcore.json). Run 'agentcore project create' to scaffold one.`}
    </Text>
  );
}

// `category` is "runtime"/"policy"/… or "all"; `count` is how many resources the
// category holds (the total across all categories for the "all" row).
type ResourceCategoryRow = Record<string, unknown> & { category: string; count: string };

const resourceCategoryColumns = [
  { key: "category", header: "resource", flex: true },
  { key: "count", header: "count", width: 8, align: "right" },
] satisfies DataTableColumn<ResourceCategoryRow>[];

function ResourceCategoryPicker({ project }: { project: Project }) {
  const navigate = useNavigate();

  const rows: ResourceCategoryRow[] = RESOURCE_CATEGORY_CONFIGS.flatMap((categoryConfig) => {
    const count = categoryConfig.listResources(project.spec).length;
    if (count === 0) return [];
    return [{ category: categoryConfig.category, count: String(count) }];
  });
  const totalResourceCount = rows.reduce((sum, row) => sum + Number(row.count), 0);
  if (totalResourceCount > 0) {
    rows.push({ category: "all", count: String(totalResourceCount) });
  }

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
        columns={resourceCategoryColumns}
        data={rows}
        emptyMessage="This project has no resources to remove."
        onSelect={(row) => navigate(`${REMOVE_ROOT}/${row.category}`)}
        onEscape={() => navigate("/agentcore/project")}
      />
    </Layout>
  );
}

type ResourceRow = Record<string, unknown> & { index: string; name: string; parentName: string };

function ResourcePicker({
  project,
  categoryConfig,
}: {
  project: Project;
  categoryConfig: RemovableResourceCategoryConfig;
}) {
  const navigate = useNavigate();
  const rows: ResourceRow[] = categoryConfig.listResources(project.spec).map((resource, index) => ({
    index: String(index),
    name: resource.name,
    parentName: resource.parentName ?? "",
  }));
  const columns: DataTableColumn<ResourceRow>[] = categoryConfig.parentColumnLabel
    ? [
        { key: "name", header: "name", flex: true },
        { key: "parentName", header: categoryConfig.parentColumnLabel, width: 30 },
      ]
    : [{ key: "name", header: "name", flex: true }];

  return (
    <Layout
      breadcrumb={["agentcore", "project", "remove", categoryConfig.category]}
      description={`choose a ${categoryConfig.category} to remove`}
      keyHints={KEY_HINTS}
    >
      <DataTable
        borderStyle="none"
        showFooter={false}
        focus
        columns={columns}
        data={rows}
        emptyMessage={`This project has no ${categoryConfig.category} resources.`}
        onSelect={(row) => navigate(`${REMOVE_ROOT}/${categoryConfig.category}/${row.index}`)}
        onEscape={() => navigate(REMOVE_ROOT)}
      />
    </Layout>
  );
}

function RemoveConfirm({
  project,
  core,
  categoryConfig,
  resource,
}: {
  project: Project;
  core: ScreenProps["core"];
  categoryConfig: RemovableResourceCategoryConfig;
  resource: RemovableResource;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workingDirectory = process.cwd();

  return (
    <ConfirmAction
      breadcrumb={["agentcore", "project", "remove", categoryConfig.category, resource.name]}
      title={resource.name}
      rows={[
        { label: "type", value: categoryConfig.category },
        ...(resource.parentName
          ? [{ label: categoryConfig.parentColumnLabel ?? "parent", value: resource.parentName }]
          : []),
        { label: "project", value: project.name },
      ]}
      message={`Remove ${categoryConfig.category} '${resource.name}' from project ${project.name}? This edits agentcore.json; deployed infrastructure is untouched until you deploy.`}
      isPending={false}
      error={null}
      action={async () => {
        const result = await core.projectManager.removeResource(project, resource.removeInput);
        return [
          { label: "removed", value: `${categoryConfig.category} '${resource.name}'` },
          ...result.removedEnvKeys.map((envKey) => ({ label: "env", value: `removed ${envKey}` })),
        ];
      }}
      successTitle="Resource removed"
      runningLabel="Removing resource…"
      onDone={() => {
        // Refresh the list off disk only on the way out, so the success panel
        // isn't torn down mid-flow when the removed resource disappears.
        void queryClient.invalidateQueries({ queryKey: makeProjectQueryKey(workingDirectory) });
        navigate(REMOVE_ROOT);
      }}
    />
  );
}

function RemoveAllConfirm({ project, core }: { project: Project; core: ScreenProps["core"] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workingDirectory = process.cwd();

  const categoryCounts = RESOURCE_CATEGORY_CONFIGS.flatMap((categoryConfig) => {
    const count = categoryConfig.listResources(project.spec).length;
    return count === 0 ? [] : [{ label: categoryConfig.category, value: String(count) }];
  });

  const nothingToRemove = categoryCounts.length === 0;
  useInput(
    (_input, key) => {
      if (key.escape) navigate(REMOVE_ROOT);
    },
    { isActive: nothingToRemove },
  );
  if (nothingToRemove) {
    return (
      <Layout breadcrumb={["agentcore", "project", "remove", "all"]} keyHints={KEY_HINTS}>
        <Text dimColor>This project has no resources to remove.</Text>
      </Layout>
    );
  }

  return (
    <ConfirmAction
      breadcrumb={["agentcore", "project", "remove", "all"]}
      title={project.name}
      rows={categoryCounts}
      message={`Remove every resource from project ${project.name}? This empties each resource collection in agentcore.json; code under app/ is kept.`}
      isPending={false}
      error={null}
      action={async () => {
        const result = await core.projectManager.removeAllResources(project);
        return [
          { label: "removed", value: "all resources" },
          ...result.removedEnvKeys.map((envKey) => ({ label: "env", value: `removed ${envKey}` })),
        ];
      }}
      successTitle="All resources removed"
      runningLabel="Removing all resources…"
      onDone={() => {
        void queryClient.invalidateQueries({ queryKey: makeProjectQueryKey(workingDirectory) });
        navigate(REMOVE_ROOT);
      }}
    />
  );
}
