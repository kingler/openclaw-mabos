import { createRouter, createRootRoute, createRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { AccountingPage } from "@/pages/AccountingPage";
import { AgentDetailPage } from "@/pages/AgentDetailPage";
import { AgentsPage } from "@/pages/AgentsPage";
import { BusinessGoalsPage } from "@/pages/BusinessGoalsPage";
import { DecisionsPage } from "@/pages/DecisionsPage";
import { HRPage } from "@/pages/HRPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { KnowledgeGraphPage } from "@/pages/KnowledgeGraphPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { PerformancePage } from "@/pages/PerformancePage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { TimelinePage } from "@/pages/TimelinePage";
import { WorkflowsPage } from "@/pages/WorkflowsPage";

// Root layout
const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

// Route tree
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
});

// Agents layout route: renders Outlet for child routes
const agentsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  component: () => <Outlet />,
});

// Index route for /agents (the grid)
const agentsIndexRoute = createRoute({
  getParentRoute: () => agentsLayoutRoute,
  path: "/",
  component: AgentsPage,
});

// Detail route for /agents/$agentId
const agentDetailRoute = createRoute({
  getParentRoute: () => agentsLayoutRoute,
  path: "$agentId",
  component: AgentDetailPage,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  component: ProjectsPage,
});
const performanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/performance",
  component: PerformancePage,
});
const timelineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/timeline",
  component: TimelinePage,
});
const inventoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory",
  component: InventoryPage,
});
const accountingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accounting",
  component: AccountingPage,
});
const hrRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/hr",
  component: HRPage,
});
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: OnboardingPage,
});
const decisionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/decisions",
  component: DecisionsPage,
});
const goalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/goals",
  component: BusinessGoalsPage,
});
const knowledgeGraphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/knowledge-graph",
  component: KnowledgeGraphPage,
});
const workflowsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workflows",
  component: WorkflowsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  agentsLayoutRoute.addChildren([agentsIndexRoute, agentDetailRoute]),
  projectsRoute,
  performanceRoute,
  timelineRoute,
  inventoryRoute,
  accountingRoute,
  hrRoute,
  onboardingRoute,
  decisionsRoute,
  goalsRoute,
  knowledgeGraphRoute,
  workflowsRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: "/mabos/dashboard",
});

// Type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
