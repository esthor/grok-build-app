import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { App } from "./App";
import { debounced } from "./state/persist";
import { findSkin, setSkin, settingsStore, updateSettings } from "./state/settings";
import { setWindowOpen, WIN_IDS, windowsStore, type WinId } from "./state/windows";

/**
 * The workspace is deep-linkable: ?skin=Terminal%20Amber&x2=1&wins=main,queue
 * — a TanStack Router typed-search-params flex, and genuinely handy for
 * sharing a layout.
 */
interface AppSearch {
  readonly skin?: string;
  readonly x2?: boolean;
  readonly wins?: string;
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

function validateSearch(search: Record<string, unknown>): AppSearch {
  const out: { skin?: string; x2?: boolean; wins?: string } = {};
  if (typeof search["skin"] === "string" && search["skin"].length > 0) {
    out.skin = search["skin"];
  }
  if (search["x2"] === true || search["x2"] === "1" || search["x2"] === 1) {
    out.x2 = true;
  }
  if (typeof search["wins"] === "string" && search["wins"].length > 0) {
    out.wins = search["wins"];
  }
  return out;
}

function AppShell(): ReactNode {
  const search = indexRoute.useSearch();
  const navigate = useNavigate();

  // hydrate once from the URL
  useEffect(() => {
    if (search.skin !== undefined && findSkin(search.skin) !== null) {
      setSkin(search.skin);
    }
    if (search.x2 !== undefined) {
      updateSettings({ doubleSize: search.x2 });
    }
    if (search.wins !== undefined) {
      const open = new Set(search.wins.split(","));
      for (const id of WIN_IDS) {
        setWindowOpen(id, open.has(id));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot-time only
  }, []);

  // reflect state back into the URL, debounced
  useEffect(() => {
    const reflect = debounced(() => {
      const settings = settingsStore.state;
      const wins = WIN_IDS.filter((id: WinId) => windowsStore.state.wins[id].open).join(",");
      const next: { skin?: string; x2?: boolean; wins?: string } = {};
      next.skin = settings.skinName;
      if (settings.doubleSize) {
        next.x2 = true;
      }
      next.wins = wins;
      void navigate({ to: "/", search: next, replace: true });
    }, 500);
    const subSettings = settingsStore.subscribe(reflect);
    const subWindows = windowsStore.subscribe(reflect);
    return () => {
      subSettings.unsubscribe();
      subWindows.unsubscribe();
    };
  }, [navigate]);

  return <App />;
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch,
  component: AppShell,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
