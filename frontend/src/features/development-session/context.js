"use client";
import { createContext, useContext } from "react";
export const DevelopmentWorkspaceContext = createContext({
  switchWorkspace: () => {},
  switching: false,
});
export const useDevelopmentWorkspace = () =>
  useContext(DevelopmentWorkspaceContext);
