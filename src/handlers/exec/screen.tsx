import { useNavigate, useParams, useSearchParams } from "react-router";
import type { ScreenProps } from "../types";
import { HarnessPicker } from "../../components/HarnessPicker";
import { HarnessChat } from "../harness/invoke/screen";
import { RuntimeShellScreen } from "../runtime/shell/screen";

// ExecScreen dispatches to the existing Runtime shell or Harness exec screen
// based on the resourceType query parameter.
export function ExecScreen(props: ScreenProps) {
  const { resourceId } = useParams();
  const [search] = useSearchParams();

  if (search.get("resourceType") === "runtime") {
    return (
      <RuntimeShellScreen
        {...props}
        runtimeId={resourceId}
        qualifier={search.get("qualifier") ?? undefined}
        routePath="/agentcore/exec"
        resourceType="runtime"
      />
    );
  }

  return <HarnessExecScreen {...props} resourceId={resourceId} />;
}

// Harness exec uses the shared harness chat screen, starting in exec mode.
function HarnessExecScreen({ resourceId, ...props }: ScreenProps & { resourceId?: string }) {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = search.get("sessionId") ?? undefined;

  if (!resourceId) {
    return (
      <HarnessPicker
        {...props}
        breadcrumb={["agentcore", "exec"]}
        description="choose a harness to exec into"
        onSelect={(id) =>
          navigate(`/agentcore/exec/${encodeURIComponent(id)}?resourceType=harness`)
        }
      />
    );
  }
  return (
    <HarnessChat
      {...props}
      harnessId={resourceId}
      initialSessionId={sessionId}
      initialQualifier={search.get("qualifier") ?? undefined}
      variant="exec"
    />
  );
}
