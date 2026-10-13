/** Compare both parts of a tutorial destination, including an explicitly empty query. */
export function isTourRouteCurrent(route: string, pathname: string, search: string): boolean {
  const destination = new URL(route, 'https://studyx.local');
  return destination.pathname === pathname && destination.search === search;
}
