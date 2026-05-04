/**
 * Phase Z: Routes are URL-persistence only. View selection lives in
 * NavigationState and is rendered by `MainTabContent` inside `AppShell`.
 * Returning null here prevents the old OverviewPage from rendering
 * alongside the active tab and squeezing it to zero height.
 */
export default function OverviewRoute() {
  return null;
}
