"use client";
import { createTheme } from "@mui/material/styles";
import { tokens } from "@/styles/tokens";
export const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: {
      main: tokens.color.primary,
      contrastText: "#ffffff",
      dark: tokens.color.primaryDark,
    },
    secondary: { main: tokens.color.navy },
    error: { main: tokens.color.danger },
    background: { default: tokens.color.background, paper: "#fff" },
    text: { primary: tokens.color.text, secondary: tokens.color.muted },
    divider: tokens.color.border,
  },
  typography: {
    fontFamily: tokens.font,
    fontSize: 13,
    button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
    h1: { fontSize: "1.9rem", fontWeight: 650, letterSpacing: "-0.045em" },
    h2: { fontSize: "1.4rem", fontWeight: 650, letterSpacing: "-0.025em" },
    h3: { fontSize: "1.05rem", fontWeight: 650 },
    body2: { fontSize: ".82rem", lineHeight: 1.65 },
  },
  shape: { borderRadius: tokens.radius },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 7, minHeight: 38, padding: "8px 16px" },
        outlined: {
          borderColor: tokens.color.border,
          color: tokens.color.text,
        },
        contained: { boxShadow: "0 2px 3px rgb(8 127 140 / 8%)" },
      },
    },
    MuiTextField: { defaultProps: { size: "small", fullWidth: true } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { background: "#fff", borderRadius: 7, fontSize: 13 },
        notchedOutline: { borderColor: tokens.color.border },
        input: { padding: "11px 12px" },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontSize: 13 } } },
    MuiDialog: {
      defaultProps: { fullWidth: true, maxWidth: "sm" },
      styleOverrides: { paper: { borderRadius: 14 } },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontWeight: 650, fontSize: 19, padding: "24px 24px 12px" },
      },
    },
    MuiDialogActions: {
      styleOverrides: { root: { padding: "16px 24px 24px", gap: 8 } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: tokens.color.border,
          padding: "16px 20px",
          fontSize: 13,
        },
        head: {
          background: "#f8fafc",
          color: tokens.color.muted,
          fontWeight: 600,
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: ".065em",
          padding: "13px 20px",
        },
      },
    },
    MuiAlert: { styleOverrides: { root: { borderRadius: 8, fontSize: 13 } } },
    MuiTooltip: { defaultProps: { arrow: true } },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 46 },
        indicator: { height: 3, borderRadius: 3 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          minHeight: 46,
          fontSize: 13,
        },
      },
    },
  },
});
