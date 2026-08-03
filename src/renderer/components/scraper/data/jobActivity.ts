/** Shell-wide count used by the rail and footer. */
export function countActiveScraperJobs(
  dashboardJobActive: boolean,
  transientJobActive: boolean,
): number {
  return Number(dashboardJobActive) + Number(transientJobActive);
}
