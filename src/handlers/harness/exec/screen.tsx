import { useNavigate, useParams, useSearchParams } from "react-router";
import type { ScreenProps } from "../../types";
import { HarnessPicker } from "../../../components/HarnessPicker";
import { HarnessChat } from "../invoke/screen";

export function HarnessExecScreen(props: ScreenProps) {
  const { harnessId, sessionId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();

  if (!harnessId) {
    return (
      <HarnessPicker
        {...props}
        breadcrumb={["agentcore", "harness", "exec"]}
        description="choose a harness to exec into"
        onSelect={(id) => navigate(`/agentcore/harness/exec/${id}`)}
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
