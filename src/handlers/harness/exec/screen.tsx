import { useNavigate, useParams, useSearchParams } from "react-router";
import type { ScreenProps } from "../../types";
import { HarnessPicker } from "../../../components/HarnessPicker";
import { HarnessChat } from "../invoke/screen";

// HarnessExecScreen is `harness exec` in the TUI: the same chat screen as
// invoke, but starting in exec mode ($ prompt, enter runs a shell command in
// the session's container). Ctrl+E flips between exec and chat at any time.
// Without a `:harnessId` route value it renders the harness picker. A
// `:sessionId` route value resumes that runtime session.
type HarnessExecScreenProps = ScreenProps & {
  harnessId?: string;
  sessionId?: string;
  routePath?: string;
  resourceType?: "harness";
};

export function HarnessExecScreen({
  harnessId: routeHarnessId,
  sessionId: routeSessionId,
  routePath = "/agentcore/harness/exec",
  resourceType,
  ...props
}: HarnessExecScreenProps) {
  const params = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const harnessId = routeHarnessId ?? params.harnessId;
  const sessionId = routeSessionId ?? params.sessionId ?? search.get("sessionId") ?? undefined;

  if (!harnessId) {
    return (
      <HarnessPicker
        {...props}
        breadcrumb={routePath.split("/").filter(Boolean)}
        description="choose a harness to exec into"
        onSelect={(id) =>
          navigate(
            resourceType
              ? `${routePath}/${encodeURIComponent(id)}?resourceType=${resourceType}`
              : `${routePath}/${encodeURIComponent(id)}`,
          )
        }
      />
    );
  }
  return (
    <HarnessChat
      {...props}
      harnessId={harnessId}
      initialSessionId={sessionId}
      initialQualifier={search.get("qualifier") ?? undefined}
      variant="exec"
    />
  );
}
