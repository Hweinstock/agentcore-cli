import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { Layout } from "../../../components/Layout";
import { ConfirmAction } from "../../../components/ConfirmAction";
import { DataTable, type DataTableColumn } from "../../../components/ui/data-table";
import { Spinner } from "../../../components/ui/spinner";
import { Text } from "ink";
import { ProjectKey } from "../../../router";
import type { ProjectSpec } from "../../../projectSchemas/project";
import type { ScreenProps } from "../../types";
import type { Project } from "../types";

// The resource types whose removal is fully specified by a name alone. Nested
// sub-resources — gateway targets and connectors, policies, payment connectors
// — need a parent selection and stay CLI-only for now.
type SimpleResourceType =
  | "runtime"
  | "harness"
  | "memory"
  | "credential"
  | "config-bundle"
  | "online-eval"
  | "gateway"
  | "policy-engine"
  | "payment-manager";

// A removable resource type as shown in the picker: how to label it and how to
// read the names it currently holds from the project spec.
interface RemovableType {
  resourceType: SimpleResourceType;
  label: string;
  names: (spec: ProjectSpec) => string[];
}

const REMOVABLE_TYPES: RemovableType[] = [
  { resourceType: "runtime", label: "runtime", names: (s) => s.runtimes.map((r) => r.name) },
  { resourceType: "harness", label: "harness", names: (s) => s.harnesses.map((h) => h.name) },
  { resourceType: "memory", label: "memory", names: (s) => s.memories.map((m) => m.name) },
  {
    resourceType: "credential",
    label: "credential",
    names: (s) => s.credentials.map((c) => c.name),
  },
  {
    resourceType: "config-bundle",
    label: "config-bundle",
    names: (s) => s.configBundles.map((b) => b.name),
  },
  {
    resourceType: "online-eval",
    label: "online-eval",
    names: (s) => s.onlineEvalConfigs.map((c) => c.name),
  },
  {
    resourceType: "gateway",
    label: "gateway",
    names: (s) => s.agentCoreGateways.map((g) => g.name),
  },
  {
    resourceType: "policy-engine",
    label: "policy-engine",
    names: (s) => s.policyEngines.map((e) => e.name),
  },
  {
    resourceType: "payment-manager",
    label: "payment-manager",
    names: (s) => (s.payments ?? []).map((p) => p.name),
  },
];

const REMOVE_ROOT = "/agentcore/project/remove";

// ProjectRemoveScreen removes resources from the current project's spec. It
// resolves the project once, then routes on its `:resourceType`/`:name` params:
// no params → a picker of the resource types the project holds plus `all`; a
// type → a picker of that type's resources; a type + name (or `all`) → the
// shared ConfirmAction. esc walks back one level, matching harness delete.
export function ProjectRemoveScreen({ ctx, core }: ScreenProps) {
  const { resourceType, name } = useParams();

  const fromCtx = ctx.value(ProjectKey);
  const cwd = process.cwd();
  const query = useQuery({
    queryKey: ["project", "remove", cwd],
    // react-query rejects an undefined resolution; normalize "no project" to null.
    queryFn: async () => (await core.projectManager.resolve({ filePath: cwd })) ?? null,
    enabled: !fromCtx,
  });
  const project = fromCtx ?? query.data ?? undefined;

  const breadcrumb = ["agentcore", "project", "remove"];

  if (!project) {
    const backHints = [
      { key: "esc", label: "back" },
      { key: "ctl+c", label: "quit" },
    ];
    if (!fromCtx && query.isPending) {
      return (
        <Layout
          breadcrumb={breadcrumb}
          description="resolving the current project"
          keyHints={backHints}
        >
          <Spinner label="Resolving project…" />
        </Layout>
      );
    }
    // A resolve that threw (e.g. a malformed agentcore.json) is a real failure,
    // distinct from simply not finding a project; surface its message rather
    // than the misleading "no project found".
    if (query.isError) {
      return (
        <Layout
          breadcrumb={breadcrumb}
          description="unable to resolve the project"
          keyHints={backHints}
        >
          <Text color="red">{(query.error as Error).message}</Text>
        </Layout>
      );
    }
    return (
      <Layout breadcrumb={breadcrumb} description="no project found" keyHints={backHints}>
        <Text color="red">
          {`No AgentCore project found at ${cwd} or any parent directory ` +
            `(looked for agentcore/agentcore.json). Run 'agentcore project create' to scaffold one.`}
        </Text>
      </Layout>
    );
  }

  if (!resourceType) {
    return <ResourceTypePicker project={project} />;
  }

  if (resourceType === "all") {
    return <RemoveAllConfirm project={project} core={core} />;
  }

  const removable = REMOVABLE_TYPES.find((entry) => entry.resourceType === resourceType);
  if (!removable) {
    return (
      <Layout
        breadcrumb={[...breadcrumb, resourceType]}
        description="unknown resource type"
        keyHints={[
          { key: "esc", label: "back" },
          { key: "ctl+c", label: "quit" },
        ]}
      >
        <Text color="red">{`'${resourceType}' cannot be removed from the interactive screen.`}</Text>
      </Layout>
    );
  }

  if (!name) {
    return <ResourceNamePicker project={project} removable={removable} />;
  }

  return <RemoveConfirm project={project} core={core} removable={removable} name={name} />;
}

type TypeRow = Record<string, unknown> & { type: string; count: string; value: string };

const typeColumns = [
  { key: "type", header: "type", flex: true },
  { key: "count", header: "count", width: 8, align: "right" },
] satisfies DataTableColumn<TypeRow>[];

// ResourceTypePicker lists the resource types the project holds plus an `all`
// row that empties every collection.
function ResourceTypePicker({ project }: { project: Project }) {
  const navigate = useNavigate();

  const rows: TypeRow[] = REMOVABLE_TYPES.flatMap((entry) => {
    const count = entry.names(project.spec).length;
    if (count === 0) return [];
    return [{ type: entry.label, count: String(count), value: entry.resourceType }];
  });
  rows.push({ type: "all", count: "", value: "all" });

  return (
    <Layout
      breadcrumb={["agentcore", "project", "remove"]}
      description={`choose a resource to remove from project ${project.name}`}
      keyHints={[
        { key: "↑↓/jk", label: "navigate" },
        { key: "/", label: "filter" },
        { key: "enter", label: "select" },
        { key: "esc", label: "cancel" },
        { key: "ctl+c", label: "quit" },
      ]}
    >
      <DataTable
        borderStyle="none"
        showFooter={false}
        focus
        columns={typeColumns}
        data={rows}
        emptyMessage="This project has no resources to remove."
        onSelect={(row) => navigate(`${REMOVE_ROOT}/${row.value}`)}
        onEscape={() => navigate("/agentcore/project")}
      />
    </Layout>
  );
}

type NameRow = Record<string, unknown> & { name: string };

const nameColumns = [
  { key: "name", header: "name", flex: true },
] satisfies DataTableColumn<NameRow>[];

// ResourceNamePicker lists the individual resources of one type. Selecting one
// opens its confirmation; esc returns to the resource-type list.
function ResourceNamePicker({
  project,
  removable,
}: {
  project: Project;
  removable: RemovableType;
}) {
  const navigate = useNavigate();
  const rows: NameRow[] = removable.names(project.spec).map((name) => ({ name }));

  return (
    <Layout
      breadcrumb={["agentcore", "project", "remove", removable.label]}
      description={`choose a ${removable.label} to remove`}
      keyHints={[
        { key: "↑↓/jk", label: "navigate" },
        { key: "/", label: "filter" },
        { key: "enter", label: "select" },
        { key: "esc", label: "back" },
        { key: "ctl+c", label: "quit" },
      ]}
    >
      <DataTable
        borderStyle="none"
        showFooter={false}
        focus
        columns={nameColumns}
        data={rows}
        emptyMessage={`This project has no ${removable.label} resources.`}
        onSelect={(row) => navigate(`${REMOVE_ROOT}/${removable.resourceType}/${row.name}`)}
        onEscape={() => navigate(REMOVE_ROOT)}
      />
    </Layout>
  );
}

// RemoveConfirm confirms and performs the removal of a single named resource.
function RemoveConfirm({
  project,
  core,
  removable,
  name,
}: {
  project: Project;
  core: ScreenProps["core"];
  removable: RemovableType;
  name: string;
}) {
  const navigate = useNavigate();

  return (
    <ConfirmAction
      breadcrumb={["agentcore", "project", "remove", removable.label, name]}
      title={name}
      rows={[
        { label: "type", value: removable.label },
        { label: "project", value: project.name },
      ]}
      message={`Remove ${removable.label} '${name}' from project ${project.name}? This edits agentcore.json; deployed infrastructure is untouched until you deploy.`}
      isPending={false}
      error={null}
      action={async () => {
        const result = await core.projectManager.removeResource(project, {
          resourceType: removable.resourceType,
          name,
        });
        return [
          { label: "removed", value: `${removable.label} '${name}'` },
          ...result.removedEnvKeys.map((key) => ({ label: "env", value: `removed ${key}` })),
        ];
      }}
      successTitle="Resource removed"
      runningLabel="Removing resource…"
      onDone={() => navigate("/agentcore/project")}
    />
  );
}

// RemoveAllConfirm confirms and performs a spec-level reset of every resource
// collection, mirroring `project remove all --yes`.
function RemoveAllConfirm({ project, core }: { project: Project; core: ScreenProps["core"] }) {
  const navigate = useNavigate();

  const populated = REMOVABLE_TYPES.flatMap((entry) => {
    const count = entry.names(project.spec).length;
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
