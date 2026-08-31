import { Layout } from "./Layout";
import { DataTable, type DataTableColumn } from "./ui/data-table";

export interface StaticTablePickerProps<TRow extends Record<string, unknown>> {
  breadcrumb: string[];
  description?: string;
  columns: DataTableColumn<TRow>[];
  rows: TRow[];
  onSelect: (row: TRow) => void;
  onBack: () => void;
  emptyMessage: string;
}

// StaticTablePicker is the in-memory counterpart to PaginatedTablePicker: a
// filterable, keyboard-navigable table over caller-supplied rows, wrapped in
// the standard Layout and key hints. Use it when the rows are already resolved
// (e.g. read from a project spec) rather than paged from a service.
export function StaticTablePicker<TRow extends Record<string, unknown>>({
  breadcrumb,
  description,
  columns,
  rows,
  onSelect,
  onBack,
  emptyMessage,
}: StaticTablePickerProps<TRow>) {
  return (
    <Layout
      breadcrumb={breadcrumb}
      description={description}
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
        columns={columns}
        data={rows}
        emptyMessage={emptyMessage}
        onSelect={onSelect}
        onEscape={onBack}
      />
    </Layout>
  );
}
