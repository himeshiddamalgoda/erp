"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import {
  Avatar,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  MenuItem,
  Select,
  Tooltip,
} from "@mui/material";
import {
  ArrowUpRight,
  Box,
  ChevronDown,
  ChevronRight,
  FileText,
  HelpCircle,
  Layers3,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  ShieldCheck,
  Shirt,
  Users,
  X,
} from "lucide-react";
import { API } from "@/constants/api";
import { ROUTES } from "@/constants/routes";
import { initials } from "@/utils/format";
import {
  setMobileNavOpen,
  toggleOrders,
  setWorkspace,
  setEditorDirty,
} from "@/store/ui-slice";
import styles from "./app-shell.module.css";

export function AppShell({
  children,
  actor,
  breadcrumb,
  onRefresh,
  refreshing = false,
}) {
  const dispatch = useDispatch();
  const { mobileNavOpen, ordersExpanded, workspace, editorDirty } = useSelector(
    (s) => s.ui,
  );
  const pathname = usePathname();
  const router = useRouter();
  const isSalesOrders = pathname.startsWith(ROUTES.salesOrders);
  const isCustomers = pathname.startsWith(ROUTES.customers);
  const section = isCustomers
    ? "Customers"
    : isSalesOrders
      ? "Sales orders"
      : "Quotations";
  const sectionHref = isCustomers
    ? ROUTES.customers
    : isSalesOrders
      ? ROUTES.salesOrders
      : ROUTES.quotations;
  breadcrumb = breadcrumb || section;
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const navigate = (event) => {
    if (
      editorDirty &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      event.button === 0
    ) {
      event.preventDefault();
      setPendingNavigation(event.currentTarget.getAttribute("href"));
    } else dispatch(setMobileNavOpen(false));
  };
  const [nextWorkspace, setNextWorkspace] = useState(null);
  const selectWorkspace = (value) => {
    if (value === workspace) return;
    if (editorDirty) setNextWorkspace(value);
    else dispatch(setWorkspace(value));
  };
  const nav = (
    <div className={styles.sidebarInner}>
      <Link
        href={ROUTES.quotations}
        className={styles.brand}
        onClick={navigate}
      >
        <span className={styles.brandIcon}>
          <Layers3 size={23} />
        </span>
        <span>
          thread<span className={styles.brandSuffix}>ERP</span>
        </span>
      </Link>
      <div className={styles.company}>
        <div className={styles.companyAvatar}>TA</div>
        <div>
          <strong>Main workspace</strong>
          <small>Garment operations</small>
        </div>
        <ChevronDown size={14} />
      </div>
      <span className={styles.navLabel}>WORKSPACE</span>
      <button className={styles.navItem} disabled>
        <LayoutDashboard size={17} />
        <span>Overview</span>
        <span className={styles.soon}>Soon</span>
      </button>
      <button
        className={`${styles.navItem} ${styles.orders}`}
        aria-expanded={ordersExpanded}
        onClick={() => dispatch(toggleOrders())}
      >
        <Box size={18} />
        <span>Orders</span>
        {ordersExpanded ? (
          <ChevronDown size={14} />
        ) : (
          <ChevronRight size={14} />
        )}
      </button>
      <Collapse in={ordersExpanded}>
        <div className={styles.subnav}>
          <Link
            href={ROUTES.quotations}
            aria-current={
              pathname.startsWith(ROUTES.quotations) ? "page" : undefined
            }
            className={
              isSalesOrders || isCustomers ? styles.navLink : styles.navActive
            }
            onClick={navigate}
          >
            <FileText size={16} />
            <span>Quotations</span>
            {!isSalesOrders && !isCustomers && (
              <span className={styles.activeIndicator} />
            )}
          </Link>
          <Link
            href={ROUTES.salesOrders}
            onClick={navigate}
            className={isSalesOrders ? styles.navActive : styles.navLink}
            aria-current={isSalesOrders ? "page" : undefined}
          >
            <Box size={16} />
            <span>Sales orders</span>
            {isSalesOrders && <span className={styles.activeIndicator} />}
          </Link>
          <Link
            href={ROUTES.customers}
            onClick={navigate}
            className={isCustomers ? styles.navActive : styles.navLink}
            aria-current={isCustomers ? "page" : undefined}
          >
            <Users size={16} />
            <span>Customers</span>
            {isCustomers && <span className={styles.activeIndicator} />}
          </Link>
        </div>
      </Collapse>
      <button className={styles.navItem} disabled>
        <Shirt size={18} />
        <span>Style library</span>
        <span className={styles.soon}>Soon</span>
      </button>
      <div className={styles.sidebarFooter}>
        <div className={styles.workspaceNote}>
          <ShieldCheck size={18} />
          <div>
            <strong>Your team&apos;s workspace</strong>
            <p>Every offer, with a clear history.</p>
          </div>
        </div>
        <div className={styles.sidebarFootline}>
          <span className={styles.onlineDot} />
          All your details. In one thread.
        </div>
      </div>
    </div>
  );
  return (
    <div className={styles.app}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <aside className={styles.sidebar}>{nav}</aside>
      <Drawer
        open={mobileNavOpen}
        onClose={() => dispatch(setMobileNavOpen(false))}
        slotProps={{ paper: { className: styles.mobileSidebar } }}
      >
        <IconButton
          className={styles.closeNav}
          onClick={() => dispatch(setMobileNavOpen(false))}
          aria-label="Close navigation"
        >
          <X size={18} />
        </IconButton>
        {nav}
      </Drawer>
      <div className={styles.workspace}>
        <header className={styles.header}>
          <div className={styles.breadcrumbs}>
            <IconButton
              className={styles.menuButton}
              aria-label="Open navigation"
              onClick={() => dispatch(setMobileNavOpen(true))}
            >
              <Menu size={20} />
            </IconButton>
            <span className={styles.desktopPanelIcon}>
              <PanelLeftClose size={17} />
            </span>
            <span className={styles.crumbRoot}>Orders</span>
            <ChevronRight size={13} />
            <Link href={sectionHref} onClick={navigate}>
              {section}
            </Link>
            {breadcrumb !== section && (
              <>
                <ChevronRight size={13} />
                <span className={styles.currentCrumb}>{breadcrumb}</span>
              </>
            )}
          </div>
          <div className={styles.headerRight}>
            {API.demoWorkspaces && (API.manager || API.admin) && (
              <Select
                size="small"
                value={workspace}
                onChange={(e) => selectWorkspace(e.target.value)}
                inputProps={{ "aria-label": "Development workspace" }}
                className={styles.workspaceSelect}
              >
                <MenuItem value="sales">Sales workspace</MenuItem>
                {API.manager && (
                  <MenuItem value="manager">Manager workspace</MenuItem>
                )}
                {API.admin && (
                  <MenuItem value="admin">Admin workspace</MenuItem>
                )}
              </Select>
            )}
            <Tooltip title={`${section} workspace`}>
              <span className={styles.helpIcon}>
                <HelpCircle size={18} />
              </span>
            </Tooltip>
            <span className={styles.headerDivider} />
            <Avatar className={styles.avatar}>
              {initials(actor?.displayName)}
            </Avatar>
            <div className={styles.identity}>
              <strong>{actor?.displayName || "Your workspace"}</strong>
              <small>
                {actor?.role === "SalesManager"
                  ? "Sales manager"
                  : actor?.role || "Connecting…"}
              </small>
            </div>
          </div>
        </header>
        <main id="main-content" className={styles.main} aria-busy={refreshing}>
          {children}
        </main>
        <footer className={styles.pageFooter}>
          <span>
            Thread ERP <span className={styles.footerDot}>·</span> Thoughtfully
            connected.
          </span>
          {onRefresh && (
            <button onClick={onRefresh} disabled={refreshing}>
              Refresh workspace <ArrowUpRight size={13} />
            </button>
          )}
        </footer>
      </div>
      <Dialog
        open={Boolean(pendingNavigation)}
        onClose={() => setPendingNavigation(null)}
      >
        <DialogTitle>
          {isCustomers ? "Leave this customer form?" : "Leave this draft?"}
        </DialogTitle>
        <DialogContent>
          Your unsaved changes will be lost. Save before leaving if you want to
          return to these edits.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingNavigation(null)}>
            Keep editing
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              dispatch(setEditorDirty(false));
              dispatch(setMobileNavOpen(false));
              router.push(pendingNavigation);
              setPendingNavigation(null);
            }}
          >
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(nextWorkspace)}
        onClose={() => setNextWorkspace(null)}
      >
        <DialogTitle>Switch workspace?</DialogTitle>
        <DialogContent>
          You have unsaved changes. Switching will close the current form.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNextWorkspace(null)}>Keep editing</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              dispatch(setWorkspace(nextWorkspace));
              setNextWorkspace(null);
            }}
          >
            Discard and switch
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
