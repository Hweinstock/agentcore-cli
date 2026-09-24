import { useNavigate, useParams, useSearchParams } from "react-router";
import type { ScreenProps } from "../types";
import { HarnessPicker } from "../../components/HarnessPicker";
import { HarnessChat } from "../harness/invoke/screen";
import { RuntimeShellScreen } from "../runtime/shell/screen";

// ExecScreen dispatches to the existing Runtime shell or Harness exec screen
// based on the resourceType query parameter.
export function ExecScreen(props: ScreenProps) {
  const { resourceType, resourceId, sessionId } = useParams();
  const [search] = useSearchParams();

  if (resourceType === "runtime") {
    return (
      <RuntimeShellScreen
        {...props}
        runtimeId={resourceId}
        qualifier={search.get("qualifier") ?? undefined}
        routePath="/agentcore/exec/runtime"
      />
    );
  }

  return <HarnessExecScreen {...props} resourceId={resourceId} sessionId={sessionId} />;
}

// Harness exec uses the shared harness chat screen, starting in exec mode.
function HarnessExecScreen({
  resourceId,
  sessionId,
  ...props
}: ScreenProps & { resourceId?: string; sessionId?: string }) {
  const [search] = useSearchParams();
  const navigate = useNavigate();

  if (!resourceId) {
    return (
      <HarnessPicker
        {...props}
        breadcrumb={["agentcore", "exec"]}
        description="choose a harness to exec into"
        onSelect={(id) => navigate(`/agentcore/exec/harness/${encodeURIComponent(id)}`)}
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
