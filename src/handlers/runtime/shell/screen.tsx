import { useEffect, useRef } from "react";
import { useApp, useStderr, useStdin, useStdout } from "ink";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { RuntimeEndpointPicker } from "../../../components/RuntimeEndpointPicker";
import { RuntimePicker } from "../../../components/RuntimePicker";
import { Spinner } from "../../../components/ui/spinner";
import { SilentCLIError } from "../../../errors";
import type { ScreenProps } from "../../types";
import { RuntimeShellLaunchContextKey } from "./launchContext";
import { runRuntimeShell } from "./operation";

type RuntimeShellLocationState = {
  returnOnEscape?: boolean;
  returnPath?: string;
};

const shellPath = (...parts: string[]) =>
  ["/agentcore/runtime/shell", ...parts.map(encodeURIComponent)].join("/");

type RuntimeShellScreenProps = ScreenProps & {
  runtimeId?: string;
  qualifier?: string;
  routePath?: string;
  resourceType?: "runtime";
};

export function RuntimeShellScreen({
  runtimeId: routeRuntimeId,
  qualifier: routeQualifier,
  routePath = "/agentcore/runtime/shell",
  resourceType,
  ...props
}: RuntimeShellScreenProps) {
  const { runtimeId: paramRuntimeId, qualifier: paramQualifier } = useParams();
  const [search] = useSearchParams();
  const runtimeId = routeRuntimeId ?? paramRuntimeId;
  const qualifier = paramQualifier ?? routeQualifier ?? search.get("qualifier") ?? undefined;
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as RuntimeShellLocationState | null;
  const returnOnEscape = locationState?.returnOnEscape;
  const route = (id?: string, endpoint?: string) => {
    if (routePath === "/agentcore/runtime/shell") {
      return id === undefined ? shellPath() : shellPath(id, ...(endpoint ? [endpoint] : []));
    }
    const params = new URLSearchParams({ resourceType: resourceType ?? "runtime" });
    if (endpoint) params.set("qualifier", endpoint);
    return `${routePath}${id === undefined ? "" : `/${encodeURIComponent(id)}`}?${params}`;
  };

  if (!runtimeId) {
    return (
      <RuntimePicker
        {...props}
        breadcrumb={routePath.split("/").filter(Boolean)}
        description="choose a Runtime to open a shell"
        onSelect={(id) =>
          navigate(route(id), {
            state: { returnPath: locationState?.returnPath ?? location.pathname },
          })
        }
      />
    );
  }
  if (!qualifier) {
    const returnPath =
      locationState?.returnPath ??
      (returnOnEscape
        ? `/agentcore/runtime/get/${encodeURIComponent(runtimeId)}`
        : location.pathname);
    return (
      <RuntimeEndpointPicker
        {...props}
        runtimeId={runtimeId}
        breadcrumb={[...routePath.split("/").filter(Boolean), runtimeId]}
        description="choose an endpoint to open a shell"
        onSelect={(selected) =>
          navigate(route(runtimeId, selected), {
            replace: returnOnEscape === true,
            state: {
              ...locationState,
              returnPath,
            },
          })
        }
        onEscape={() => (returnOnEscape ? navigate(-1) : navigate(route()))}
      />
    );
  }

  return (
    <RuntimeShellHandoff
      {...props}
      runtimeId={runtimeId}
      qualifier={qualifier}
      returnPath={locationState?.returnPath}
    />
  );
}

function RuntimeShellHandoff({
  ctx,
  core,
  runtimeId,
  qualifier,
  returnPath,
}: ScreenProps & { runtimeId: string; qualifier: string; returnPath?: string }) {
  const { exit, suspendTerminal } = useApp();
  const { stdin } = useStdin();
  const { stdout } = useStdout();
  const { stderr } = useStderr();
  const navigate = useNavigate();
  const requested = useRef(false);
  const launchContext = ctx.value(RuntimeShellLaunchContextKey);
  const initialContext = launchContext?.runtimeId === runtimeId ? launchContext : undefined;

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void (async () => {
      try {
        await suspendTerminal(() =>
          runRuntimeShell({
            ctx,
            core,
            io: { stdin, stdout, stderr },
            runtimeId,
            qualifier,
            launchContext: initialContext,
          }),
        );
      } catch (error) {
        if (returnPath === undefined || !(error instanceof SilentCLIError)) {
          exit(error);
          return;
        }
      }
      if (returnPath === undefined) {
        exit();
      } else {
        navigate(returnPath, { replace: true });
      }
    })();
  }, [
    core,
    ctx,
    exit,
    initialContext,
    navigate,
    qualifier,
    returnPath,
    runtimeId,
    stderr,
    stdin,
    stdout,
    suspendTerminal,
  ]);

  return <Spinner label={`Opening shell for ${runtimeId} (${qualifier})...`} />;
}
