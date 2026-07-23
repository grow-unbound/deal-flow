export function resolveSellerSidebarLayout({
  isUserCollapsed,
  isLargeScreen,
  isForcedCollapsed,
}: {
  isUserCollapsed: boolean;
  isLargeScreen: boolean;
  isForcedCollapsed: boolean;
}) {
  if (isLargeScreen) {
    return {
      isCollapsed: false,
      canCollapse: false,
      sidebarWidth: '248px',
    };
  }

  if (isForcedCollapsed) {
    return {
      isCollapsed: true,
      canCollapse: false,
      sidebarWidth: '72px',
    };
  }

  return {
    isCollapsed: isUserCollapsed,
    canCollapse: true,
    sidebarWidth: isUserCollapsed ? '72px' : '248px',
  };
}
