import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useWindowSize } from "ink";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
import type { ScreenProps } from "../../types";
import { coreOptsFromCtx } from "../../utils";
import { RuntimePicker } from "../../../components/RuntimePicker";
import { Layout } from "../../../components/Layout";
import { Divider } from "../../../components/ui/divider";
import { Spinner } from "../../../components/ui/spinner";
import { TextInput } from "../../../components/ui/text-input";
import { darkTheme, glyphs } from "../../../components/ui/_core.js";
import {
  applyExecEvent,
  finishExec,
  newExecItem,
  newSessionId,
  type ExecItem,
  type TranscriptItem,
} from "../../harness/invoke/transcript";

const theme = darkTheme;

type RuntimeExecItem = ExecItem | Extract<TranscriptItem, { kind: "error" | "notice" }>;

const execPath = (runtimeId?: string, sessionId?: string) => {
  const parts = ["/agentcore/exec/runtime"];
  if (runtimeId !== undefined) parts.push(encodeURIComponent(runtimeId));
  if (sessionId !== undefined) parts.push(encodeURIComponent(sessionId));
  return parts.join("/");
};

export function RuntimeExecScreen(props: ScreenProps) {
  const { resourceId, sessionId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const qualifier = search.get("qualifier") ?? "DEFAULT";
  const timeoutValue = search.get("timeout");
  const timeout = timeoutValue === null ? undefined : Number(timeoutValue);

  if (!resourceId) {
    return (
      <RuntimePicker
        {...props}
        breadcrumb={["agentcore", "exec", "runtime"]}
        description="choose a Runtime to exec into"
        onSelect={(id) => navigate(execPath(id, sessionId))}
      />
    );
  }

  return (
    <RuntimeExecConsole
      {...props}
      runtimeId={resourceId}
      sessionId={sessionId}
      qualifier={qualifier}
      timeout={Number.isFinite(timeout) ? timeout : undefined}
    />
  );
}

function RuntimeExecConsole({
  ctx,
  core,
  runtimeId,
  sessionId: initialSessionId,
  qualifier,
  timeout,
}: ScreenProps & {
  runtimeId: string;
  sessionId?: string;
  qualifier: string;
  timeout?: number;
}) {
  const opts = coreOptsFromCtx(ctx);
  const { columns, rows } = useWindowSize();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ["runtime", opts.region, runtimeId],
    queryFn: ({ signal }) => core.runtime.getRuntime(runtimeId, opts, signal),
  });
  const [sessionId] = useState(() => initialSessionId ?? newSessionId());
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [items, setItems] = useState<RuntimeExecItem[]>([]);
  const historyRef = useRef<RuntimeExecItem[]>([]);
  const streamingRef = useRef(false);
  const aliveRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollViewRef>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (stickRef.current) scrollRef.current?.scrollToBottom();
  }, [items]);

  const sync = () => {
    if (aliveRef.current) setItems([...historyRef.current]);
  };

  const run = async (value: string) => {
    const command = value.trim();
    const arn = detail.data?.agentRuntimeArn;
    if (command === "" || streamingRef.current || !arn) return;

    setInput("");
    stickRef.current = true;
    const item = newExecItem(command);
    historyRef.current.push(item);
    streamingRef.current = true;
    setStreaming(true);
    sync();

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await core.harness.invokeAgentRuntimeCommand(
        {
          agentRuntimeArn: arn,
          qualifier,
          runtimeSessionId: sessionId,
          body: { command, ...(timeout !== undefined && { timeout }) },
        },
        opts,
        controller.signal,
      );
      for await (const event of response.stream ?? []) {
        if (!aliveRef.current) return;
        applyExecEvent(item, event);
        sync();
      }
      finishExec(item);
    } catch (error) {
      finishExec(item);
      if (controller.signal.aborted || (error as Error)?.name === "AbortError") {
        historyRef.current.push({ kind: "notice", text: "interrupted" });
      } else {
        historyRef.current.push({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      abortRef.current = null;
      streamingRef.current = false;
      if (aliveRef.current) {
        setStreaming(false);
        sync();
      }
    }
  };

  useInput((_input, key) => {
    if (key.escape) {
      if (streamingRef.current) abortRef.current?.abort();
      else navigate(-1);
      return;
    }
    const view = scrollRef.current;
    if (!view) return;
    if (key.upArrow) {
      const offset = view.getScrollOffset();
      view.scrollBy(-1);
      if (offset - 1 < view.getBottomOffset()) stickRef.current = false;
    }
    if (key.downArrow) {
      const offset = view.getScrollOffset();
      view.scrollBy(1);
      if (offset + 1 >= view.getBottomOffset()) stickRef.current = true;
    }
  });

  return (
    <Layout
      breadcrumb={["agentcore", "exec", "runtime", runtimeId, qualifier]}
      keyHints={
        streaming
          ? [
              { key: "esc", label: "interrupt" },
              { key: "ctrl+c", label: "quit" },
            ]
          : [
              { key: "enter", label: "run" },
              { key: "↑↓", label: "scroll" },
              { key: "esc", label: "back" },
              { key: "ctrl+c", label: "quit" },
            ]
      }
    >
      {detail.isPending ? (
        <Spinner label="loading Runtime…" />
      ) : detail.isError ? (
        <Text color={theme.colors.error}>
          Error: {detail.error instanceof Error ? detail.error.message : String(detail.error)}
        </Text>
      ) : (
        <Box flexDirection="column">
          <Box height={rows - 8} flexDirection="column">
            <ScrollView ref={scrollRef}>
              {items.map((item, index) => (
                <Box key={index} paddingBottom={1}>
                  <ExecItemView item={item} width={columns} />
                </Box>
              ))}
            </ScrollView>
          </Box>

          <Divider />
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={(value) => void run(value)}
            prompt="$ "
            placeholder="run a command…"
          />
          <Divider />
          <Box height={1}>
            {streaming ? (
              <Spinner label="working… (esc to interrupt)" />
            ) : (
              <Text color={theme.colors.muted}>
                session: {sessionId} · qualifier: {qualifier}
              </Text>
            )}
          </Box>
        </Box>
      )}
    </Layout>
  );
}

function ExecItemView({ item, width }: { item: RuntimeExecItem; width: number }) {
  if (item.kind === "exec") {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={theme.colors.text}>$ </Text>
          <Box width={width - 4}>
            <Text color={theme.colors.text}>{item.command}</Text>
          </Box>
        </Box>
        {item.output !== "" || item.status === "running" ? (
          <Box paddingLeft={2} width={width - 2}>
            <Text color={item.status === "error" ? theme.colors.error : theme.colors.muted}>
              {item.output.trimEnd()}
              {item.status === "running" ? "▌" : ""}
            </Text>
          </Box>
        ) : null}
        {item.status === "error" && item.exitCode !== undefined && item.exitCode !== 0 ? (
          <Box paddingLeft={2}>
            <Text color={theme.colors.error}>exit {item.exitCode}</Text>
          </Box>
        ) : null}
      </Box>
    );
  }

  if (item.kind === "error") {
    return (
      <Text color={theme.colors.error}>
        {glyphs.cross} {item.message}
      </Text>
    );
  }

  return (
    <Box paddingLeft={2}>
      <Text color={theme.colors.muted}>{item.text}</Text>
    </Box>
  );
}
