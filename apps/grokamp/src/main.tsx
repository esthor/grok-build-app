import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { boot } from "./agent/controller";
import { router } from "./router";
import { rehydrateWsz } from "./skins/wsz";
import { initSkin } from "./state/settings";
import "./styles/global.css";

initSkin();
boot();
void rehydrateWsz(); // re-wear a persisted .wsz, if one fits in storage

const queryClient = new QueryClient();

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("no #root element");
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
