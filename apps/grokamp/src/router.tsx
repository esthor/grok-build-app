import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { App } from "./App";
import { findSkin, setSkin, settingsStore, updateSettings } from "./state/settings";
import {
  openWindowIds,
  setWindowOpen,
  WIN_IDS,
  windowsStore,
  type WinId,
} from "./state/windows";

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
  // explicit off states must survive the round-trip, or shared layouts
  // silently inherit the recipient's persisted state
  const x2 = search["x2"];
  if (x2 !== undefined) {
    out.x2 = x2 === true || x2 === "1" || x2 === 1 || x2 === "true";
  }
  if (typeof search["wins"] === "string") {
    out.wins = search["wins"]; // empty string = "close everything", still authoritative
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
      const open = new Set(search.wins.split(",").filter((id) => id.length > 0));
      for (const id of WIN_IDS) {
        setWindowOpen(id, open.has(id));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot-time only
  }, []);

  // reflect state back into the URL, debounced with a cancellable handle so
  // a store change in the last half second can't navigate after unmount
  useEffect(() => {
    let handle: ReturnType<typeof setTimeout> | null = null;
    const reflect = (): void => {
      if (handle !== null) {
        clearTimeout(handle);
      }
      handle = setTimeout(() => {
        const settings = settingsStore.state;
        const open = new Set(openWindowIds(windowsStore.state));
        const wins = WIN_IDS.filter((id: WinId) => open.has(id)).join(",");
        // x2 is always written so a shared URL can say "off" explicitly
        const next: { skin: string; x2: boolean; wins: string } = {
          skin: settings.skinName,
          x2: settings.doubleSize,
          wins,
        };
        void navigate({ to: "/", search: next, replace: true });
      }, 500);
    };
    const subSettings = settingsStore.subscribe(reflect);
    const subWindows = windowsStore.subscribe(reflect);
    return () => {
      if (handle !== null) {
        clearTimeout(handle);
      }
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
