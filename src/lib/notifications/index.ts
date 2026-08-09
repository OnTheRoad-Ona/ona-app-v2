/**
 * Ona notification system — public exports.
 *
 * Usage (already wired in AppFrame):
 *   <NotificationProvider>
 *     <NotificationToasts />
 *     <NotificationCenter />
 *   </NotificationProvider>
 *
 * Trigger a demo toast from any client component:
 *   const { pushLocal } = useNotifications();
 *   pushLocal({
 *     category: "requests",
 *     priority: "critical",
 *     title: "New service request",
 *     body: "Battery · Lekki · 1.2 km",
 *     actionType: "accept_request",
 *     href: "/dashboard",
 *   });
 */

export type {
  AppNotification,
  NotificationCategory,
  NotificationPriority,
  NotificationActionType,
  NotificationFilter,
} from "@/lib/notifications/types";

export {
  COPPER,
  MESSAGE_ORANGE,
  CHARCOAL,
  SOFT_WHITE,
  isChatClosedForNotification,
  isNavigationBlocked,
  isJobFinishedStatus,
  isJobHistoryClosedStatus,
  isReleasePayPendingStatus,
  blockedActionMessage,
  isHighPriority,
  isStickyPriority,
  shouldListNotification,
  shouldToastNotification,
} from "@/lib/notifications/types";

export {
  groupNotifications,
  isGroup,
  type NotificationGroup,
} from "@/lib/notifications/group";

export {
  getQuietHours,
  setQuietHours,
  shouldShowToast,
  isInQuietHours,
} from "@/lib/notifications/quiet-hours";

export {
  TOAST_VISIBLE_MS,
  TOAST_AUTO_THROTTLE_MS,
  TOAST_MAX_STACK,
  canAutoShowToast,
} from "@/lib/notifications/toast-timing";

export {
  isNonStackNotification,
  isStackableNotification,
  isChatNotification,
  isCallNotification,
  isPaymentNotification,
  isRequestAcceptNotification,
  TOAST_MAX_NON_STACK,
} from "@/lib/notifications/stack-rules";

export { localSampleNotifications } from "@/lib/notifications/sample-local";
