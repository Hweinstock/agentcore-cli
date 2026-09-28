import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import semver from "semver";
import type { CliVersionManager } from "../cliVersionManager";

type TuiUpdateState = {
  currentVersion: string;
  latestVersion?: string;
  isChecking: boolean;
  updateAvailable: boolean;
};

const TuiUpdateContext = createContext<TuiUpdateState | undefined>(undefined);

export function TuiUpdateProvider({
  versionManager,
  children,
}: {
  versionManager: CliVersionManager;
  children: ReactNode;
}) {
  const currentVersion = versionManager.getCurrentVersion();
  const latestVersionQuery = useQuery({
    queryKey: ["cli-update", currentVersion],
    queryFn: () => versionManager.getLatestVersion(),
    retry: false,
  });
  const latestVersion = latestVersionQuery.data;
  const updateAvailable = latestVersion !== undefined && semver.gt(latestVersion, currentVersion);

  return (
    <TuiUpdateContext.Provider
      value={{
        currentVersion,
        latestVersion,
        isChecking: latestVersionQuery.isPending,
        updateAvailable,
      }}
    >
      {children}
    </TuiUpdateContext.Provider>
  );
}

export function useTuiUpdate(): TuiUpdateState {
  const updateState = useContext(TuiUpdateContext);
  if (!updateState) throw new Error("TuiUpdateProvider is missing");
  return updateState;
}
