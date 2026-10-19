"use client";
import { useState } from "react";
import {
  Provider as ReduxProvider,
  useDispatch,
  useSelector,
} from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import { Alert, CssBaseline, Snackbar } from "@mui/material";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { makeStore } from "@/store/store";
import { makeQueryClient } from "@/lib/query-client";
import { theme } from "@/lib/theme";
import { DevelopmentWorkspaceBoundary } from "@/features/development-session/pages/development-workspace-boundary";
import { dismissNotice } from "@/store/ui-slice";
function Notifications() {
  const notice = useSelector((s) => s.ui.notice);
  const dispatch = useDispatch();
  return (
    <Snackbar
      open={Boolean(notice)}
      autoHideDuration={6000}
      onClose={(_, reason) => {
        if (reason !== "clickaway") dispatch(dismissNotice());
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >
      <Alert
        onClose={() => dispatch(dismissNotice())}
        severity={notice?.severity || "success"}
        variant="filled"
      >
        {notice?.message || ""}
      </Alert>
    </Snackbar>
  );
}
export function AppProviders({ children }) {
  const [store] = useState(makeStore);
  const [queryClient] = useState(makeQueryClient);
  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ReduxProvider store={store}>
          <QueryClientProvider client={queryClient}>
            <DevelopmentWorkspaceBoundary>
              {children}
            </DevelopmentWorkspaceBoundary>
            <Notifications />
          </QueryClientProvider>
        </ReduxProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
