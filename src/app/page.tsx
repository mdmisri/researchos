import { redirect } from "next/navigation";

// Root page redirects to the research dashboard.
// Why redirect instead of putting UI here?
// The (dashboard) route group lets us add a shared layout (sidebar, nav)
// to all dashboard pages without affecting the root URL structure.
export default function RootPage() {
  redirect("/research");
}
