/**
 * Central selector registry for UI canary tests.
 * Every Playwright canary must reference selectors from this module so that
 * changes are versioned and reviewed in one place.
 */
export const Selectors = {
  login: {
    emailInput: '[data-testid="login-email-input"]',
    passwordInput: '[data-testid="login-password-input"]',
    submitButton: '[data-testid="login-submit"]',
    forgotPasswordLink: '[data-testid="login-forgot-password"]'
  },
  nav: {
    home: '[data-testid="nav-home-link"]',
    friends: '[data-testid="nav-friends-link"]',
    groups: '[data-testid="nav-groups-link"]',
    notifications: '[data-testid="nav-notifications-link"]',
    profileMenu: '[data-testid="nav-profile-menu"]',
    searchInput: '[data-testid="nav-search-input"]'
  },
  composer: {
    input: '[data-testid="composer-input"]',
    audienceSelector: '[data-testid="composer-audience-selector"]',
    submit: '[data-testid="composer-submit"]'
  },
  feed: {
    container: '[data-testid="feed"]',
    postContainer: '[data-testid="feed-post"]',
    postAuthor: '[data-testid="feed-post-author"]',
    postActions: '[data-testid="feed-post-actions"]'
  },
  notifications: {
    icon: '[data-testid="notifications-icon"]',
    dropdown: '[data-testid="notifications-dropdown"]',
    listItem: '[data-testid="notification-item"]'
  },
  account: {
    menuTrigger: '[data-testid="account-menu-trigger"]',
    logoutButton: '[data-testid="account-menu-logout"]'
  }
} as const;

export type SelectorNamespace = typeof Selectors;
type SelectorGroups = SelectorNamespace[keyof SelectorNamespace];
type ExtractSelectorValues<T> = T extends Record<string, infer V> ? V : never;
export type SelectorValue = ExtractSelectorValues<SelectorGroups>;

export interface SelectorPageDefinition {
  /** Path portion that will be appended to the base canary URL */
  urlPath: string;
  /** List of selectors that must resolve on the page */
  selectors: SelectorValue[];
  /** Whether the page is a blocking/critical contract */
  critical?: boolean;
}

export const SelectorPages: SelectorPageDefinition[] = [
  {
    urlPath: '/login',
    selectors: [
      Selectors.login.emailInput,
      Selectors.login.passwordInput,
      Selectors.login.submitButton
    ],
    critical: true
  },
  {
    urlPath: '/home',
    selectors: [
      Selectors.nav.home,
      Selectors.nav.notifications,
      Selectors.nav.profileMenu,
      Selectors.composer.input,
      Selectors.composer.submit,
      Selectors.feed.postContainer
    ],
    critical: true
  },
  {
    urlPath: '/notifications',
    selectors: [
      Selectors.notifications.icon,
      Selectors.notifications.dropdown,
      Selectors.notifications.listItem
    ]
  }
];

export const CriticalSelectorSet = new Set<string>([
  Selectors.login.submitButton,
  Selectors.nav.home,
  Selectors.composer.submit,
  Selectors.notifications.icon
]);
