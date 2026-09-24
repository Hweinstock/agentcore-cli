import { useParams, useSearchParams } from "react-router";
import { HarnessExecScreen } from "../harness/exec/screen";
import { RuntimeShellScreen } from "../runtime/shell/screen";
import type { ScreenProps } from "../types";

export function ShellScreen(props: ScreenProps) {
  const { resourceId } = useParams();
  const [search] = useSearchParams();

  if (search.get("resourceType") === "harness") {
    return (
      <HarnessExecScreen
        {...props}
        harnessId={resourceId}
        sessionId={search.get("sessionId") ?? undefined}
        routePath="/agentcore/shell"
        resourceType="harness"
      />
    );
  }

  return (
    <RuntimeShellScreen
      {...props}
      runtimeId={resourceId}
      qualifier={search.get("qualifier") ?? undefined}
      routePath="/agentcore/shell"
      resourceType="runtime"
    />
  );
}
