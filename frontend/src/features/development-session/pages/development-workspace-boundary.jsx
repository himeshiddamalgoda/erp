"use client";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useQueryClient, useIsMutating } from "@tanstack/react-query";
import { Alert, Button } from "@mui/material";
import { API, getApiBaseUrl } from "@/constants/api";
import { setWorkspace } from "@/store/ui-slice";
import { LoadingState } from "@/components/ui/page-state";
import {
  getDevelopmentSession,
  changeDevelopmentSession,
} from "../services/development-session.service";
import { DevelopmentWorkspaceContext } from "../context";
export function DevelopmentWorkspaceBoundary({ children }) {
  const dispatch = useDispatch(),
    client = useQueryClient(),
    workspace = useSelector((s) => s.ui.workspace);
  const activeMutations = useIsMutating();
  const [requested, setRequested] = useState(null);
  const [ready, setReady] = useState(!API.demoWorkspaces),
    [error, setError] = useState(null),
    [switching, setSwitching] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!API.demoWorkspaces) return;
    const controller = new AbortController();
    getDevelopmentSession(getApiBaseUrl(), controller.signal)
      .then((session) => {
        if (controller.signal.aborted) return;
        dispatch(setWorkspace(session.workspace));
        setReady(true);
        setError(null);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e);
      });
    return () => controller.abort();
  }, [dispatch, retry]);
  const switchWorkspace = async (value) => {
    if (switching || client.isMutating() || value === workspace) return;
    setRequested(value);
    setSwitching(true);
    setError(null);
    try {
      await client.cancelQueries();
      await changeDevelopmentSession(getApiBaseUrl(), value);
      client.clear();
      dispatch(setWorkspace(value));
    } catch (e) {
      setError(e);
    } finally {
      setSwitching(false);
    }
  };
  return (
    <DevelopmentWorkspaceContext.Provider
      value={{ switchWorkspace, switching: switching || activeMutations > 0 }}
    >
      {error && (
        <Alert severity="error">
          {error.message} {error.requestId && `Reference: ${error.requestId}`}
          <Button
            onClick={() =>
              ready ? switchWorkspace(requested) : setRetry((n) => n + 1)
            }
          >
            Retry connection
          </Button>
        </Alert>
      )}
      {ready ? (
        <div key={workspace} style={{ display: "contents" }}>
          {children}
        </div>
      ) : (
        !error && <LoadingState label="Connecting to development workspace…" />
      )}
    </DevelopmentWorkspaceContext.Provider>
  );
}
