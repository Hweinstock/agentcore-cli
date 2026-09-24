import { useNavigate, useParams, useSearchParams } from "react-router";
import type { ScreenProps } from "../types";
import { HarnessPicker } from "../../components/HarnessPicker";
import { HarnessChat } from "../harness/invoke/screen";
import { RuntimeExecScreen } from "./runtime/screen";

// ExecScreen dispatches to the Runtime exec or Harness exec screen based on
// the resourceType route parameter.
export function ExecScreen(props: ScreenProps) {
  const { resourceType, resourceId, sessionId } = useParams();

  if (resourceType === "runtime") {
    return <RuntimeExecScreen {...props} />;
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
