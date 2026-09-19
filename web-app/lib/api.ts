/**
 * Thin fetch-based API client for the MSME Marketplace.
 *
 * - `DJANGO_API_URL` — main backend (auth, listings, orders, verticals, etc.)
 * - `FASTAPI_URL` — compute service (pricing estimates, ML grading calls, etc.)
 *
 * These read from `NEXT_PUBLIC_*` env vars so they can also be called from
 * client components. See `.env.local` for local development defaults.
 */

export const DJANGO_API_URL =
  process.env.NEXT_PUBLIC_DJANGO_API_URL ?? "http://localhost:8000/api";

export const FASTAPI_URL =
  process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8001/compute";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string;
};

async function request<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { body, token, headers, ...rest } = options;

  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new ApiError(message || `Request failed with status ${res.status}`, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/** Calls the Django REST backend at NEXT_PUBLIC_DJANGO_API_URL. */
export const djangoApi = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(DJANGO_API_URL, path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(DJANGO_API_URL, path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(DJANGO_API_URL, path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(DJANGO_API_URL, path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(DJANGO_API_URL, path, { ...options, method: "DELETE" }),
};

/** Calls the FastAPI compute service at NEXT_PUBLIC_FASTAPI_URL. */
export const fastApi = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(FASTAPI_URL, path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(FASTAPI_URL, path, { ...options, method: "POST", body }),
};

// --- Auth (backend-django/accounts) --------------------------------------

export type UserRole = "SELLER" | "BUYER" | "ADMIN" | "VERIFIER";

export interface UserProfile {
  display_name: string;
  avatar_url: string;
  preferred_language: string;
  location_lat: number | null;
  location_lng: number | null;
}

export interface User {
  id: number;
  email: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  profile?: UserProfile;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  role: Exclude<UserRole, "ADMIN">;
  phone?: string;
  display_name?: string;
}

/** POST /api/auth/login/ — returns a JWT access + refresh pair. */
export function login(credentials: LoginCredentials) {
  return djangoApi.post<AuthTokens>("/auth/login/", credentials);
}

/** POST /api/auth/register/ — creates the user; caller should call login() next. */
export function register(payload: RegisterPayload) {
  return djangoApi.post<Pick<User, "email" | "phone" | "role">>("/auth/register/", payload);
}

/** POST /api/auth/refresh/ — exchanges a refresh token for a new access token. */
export function refreshAccessToken(refresh: string) {
  return djangoApi.post<{ access: string }>("/auth/refresh/", { refresh });
}

/** GET /api/auth/me/ — requires a bearer token. */
export function getCurrentUser(token: string) {
  return djangoApi.get<User>("/auth/me/", { token });
}

/** POST /api/auth/password-reset/ — always resolves 200 regardless of
 * whether the email exists (enumeration protection on the backend). */
export function requestPasswordReset(email: string) {
  return djangoApi.post<{ detail: string }>("/auth/password-reset/", { email });
}

/** POST /api/auth/password-reset/confirm/ — throws ApiError(400) for an
 * invalid/expired/already-used reset link. */
export function confirmPasswordReset(uid: string, token: string, newPassword: string) {
  return djangoApi.post<{ detail: string }>("/auth/password-reset/confirm/", {
    uid,
    token,
    new_password: newPassword,
  });
}

/**
 * Admin user list/toggle. Note the real mount point is `/api/auth/users/`
 * (accounts app is mounted at `/api/auth/`, not `/api/accounts/` as
 * implementation_plan.md §12 assumed — there is no `/api/accounts/` prefix
 * anywhere in core/urls.py).
 */
export interface AdminUser {
  id: number;
  email: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  profile: UserProfile | null;
}

/** GET /api/auth/users/ — admin only. */
export function listUsers(token: string) {
  return djangoApi.get<Paginated<AdminUser>>("/auth/users/", { token });
}

/** PATCH /api/auth/users/{id}/ — admin only; only `is_active` is writable. */
export function setUserActive(id: number, isActive: boolean, token: string) {
  return djangoApi.patch<AdminUser>(`/auth/users/${id}/`, { is_active: isActive }, { token });
}

// --- Pagination -------------------------------------------------------------
// Every DRF list endpoint here uses PageNumberPagination (see core/settings.py
// REST_FRAMEWORK), so list responses are `{count, next, previous, results}`,
// not bare arrays.

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// --- Config (backend-django/config) -----------------------------------------

export interface Vertical {
  id: number;
  name: string;
  slug: string;
  unit_of_measure: string;
  is_active: boolean;
  created_at: string;
}

/** GET /api/config/verticals/ */
export function listVerticals(token: string) {
  return djangoApi.get<Paginated<Vertical>>("/config/verticals/", { token });
}

/** GET /api/config/verticals/{id}/ */
export function getVertical(id: number, token: string) {
  return djangoApi.get<Vertical>(`/config/verticals/${id}/`, { token });
}

/**
 * `attributes` shape is a free-form JSONField (config/models.py:GradingSchema
 * docstring). The only keys a real consumer reads today are `name` and
 * `gradeable_by_ml` (backend-fastapi/grading/router.py:_ml_attribute_names) —
 * everything else here (type/weight/range) is admin-UI-only for now.
 */
export interface GradingAttribute {
  name: string;
  type: "numeric" | "categorical" | "boolean";
  gradeable_by_ml: boolean;
  weight: number;
  range: string;
}

export interface GradingSchema {
  id: number;
  vertical: number;
  attributes: GradingAttribute[];
  created_at: string;
  updated_at: string;
}

/** GET /api/config/verticals/{id}/grading-schema/ */
export function getGradingSchema(verticalId: number, token: string) {
  return djangoApi.get<GradingSchema>(`/config/verticals/${verticalId}/grading-schema/`, { token });
}

/** PUT /api/config/verticals/{id}/grading-schema/ (admin only) */
export function updateGradingSchema(verticalId: number, attributes: GradingAttribute[], token: string) {
  return djangoApi.put<GradingSchema>(
    `/config/verticals/${verticalId}/grading-schema/`,
    { attributes },
    { token }
  );
}

/**
 * `rules` shape is read live by backend-fastapi/pricing/service.py — unlike
 * `GradingSchema.attributes`, this one has a real consumer with an exact
 * expected shape (multipliers, not percentages). See that file's docstring.
 */
export interface PricingRuleGradeAdjustment {
  grade: string;
  multiplier: number;
}

export interface PricingRuleQuantityTier {
  min_quantity: number;
  multiplier: number;
}

export interface PricingRuleRules {
  grade_adjustment_table: PricingRuleGradeAdjustment[];
  quantity_tier_table: PricingRuleQuantityTier[];
}

export interface PricingRule {
  id: number;
  vertical: number;
  rules: PricingRuleRules;
  created_at: string;
  updated_at: string;
}

/** GET /api/config/verticals/{id}/pricing-rules/ */
export function getPricingRule(verticalId: number, token: string) {
  return djangoApi.get<PricingRule>(`/config/verticals/${verticalId}/pricing-rules/`, { token });
}

/** PUT /api/config/verticals/{id}/pricing-rules/ (admin only) */
export function updatePricingRule(verticalId: number, rules: PricingRuleRules, token: string) {
  return djangoApi.put<PricingRule>(
    `/config/verticals/${verticalId}/pricing-rules/`,
    { rules },
    { token }
  );
}

// --- Pricing (backend-django/pricing) ---------------------------------------

export type PriceSource = "AGMARKNET" | "ADMIN_ENTERED" | "CCI";

export interface PricePoint {
  id: number;
  vertical: number;
  commodity: string;
  region: string;
  price: string; // DRF serializes DecimalField as a string
  source: PriceSource;
  timestamp: string;
  raw_data: Record<string, unknown>;
}

export interface CreatePricePointPayload {
  vertical: number;
  commodity: string;
  region: string;
  price: number;
  source: PriceSource;
  timestamp: string;
  raw_data?: Record<string, unknown>;
}

/** GET /api/pricing/price-points/ — any authenticated user. */
export function listPricePoints(token: string) {
  return djangoApi.get<Paginated<PricePoint>>("/pricing/price-points/", { token });
}

/** POST /api/pricing/price-points/ — admin only (IsAdminOrReadOnly). */
export function createPricePoint(payload: CreatePricePointPayload, token: string) {
  return djangoApi.post<PricePoint>("/pricing/price-points/", payload, { token });
}

// --- Verification queue (backend-django/catalog) -----------------------------
// Not paginated like the endpoints above — VerificationQueueView is a plain
// APIView returning a bare array, not a DRF generic/viewset list.

export type VerificationPriority = "HIGH" | "MEDIUM" | "LOW";

export interface VerificationAttributeScore {
  attribute: string;
  ai_value: string;
  ai_confidence: number;
}

export interface VerificationQueueItem {
  id: number;
  listing_id: number;
  commodity_name: string;
  vertical: string;
  seller_name: string;
  ai_grade: string | null;
  ai_confidence: number | null;
  priority: VerificationPriority;
  status: "PENDING";
  evidence_image_count: number;
  flagged_reason: string;
  attribute_scores: VerificationAttributeScore[];
  created_at: string;
}

/** GET /api/verification/queue/ — Verifier/Admin only. */
export function listVerificationQueue(token: string) {
  return djangoApi.get<VerificationQueueItem[]>("/verification/queue/", { token });
}

export type ReviewDecision = "APPROVE" | "REJECT";

export interface SubmitReviewPayload {
  decision: ReviewDecision;
  notes: string;
  attribute_scores?: Record<string, string>;
}

/** POST /api/verification/queue/{listing_id}/review/ — Verifier/Admin only. */
export function submitVerificationReview(
  listingId: number,
  payload: SubmitReviewPayload,
  token: string
) {
  return djangoApi.post(`/verification/queue/${listingId}/review/`, payload, { token });
}

// --- Catalog / Listings (backend-django/catalog) -----------------------------

export type ListingStatus =
  | "DRAFT"
  | "PENDING_GRADING"
  | "PENDING_VERIFICATION"
  | "ACTIVE"
  | "SOLD"
  | "EXPIRED";

export interface Listing {
  id: number;
  client_uuid: string;
  seller: number;
  seller_name: string;
  vertical: number;
  commodity_name: string;
  sub_category: string;
  quantity: string; // DRF serializes DecimalField as a string
  unit: string;
  price_suggested: string | null;
  price_final: string | null;
  location_lat: number | null;
  location_lng: number | null;
  status: ListingStatus;
  grade: string | null;
  grade_confidence: number | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/catalog/listings/ — buyers/unauthenticated see ACTIVE only. */
export function listListings(token?: string) {
  return djangoApi.get<Paginated<Listing>>("/catalog/listings/", token ? { token } : undefined);
}

/** GET /api/catalog/listings/{id}/ */
export function getListing(id: number, token?: string) {
  return djangoApi.get<Listing>(`/catalog/listings/${id}/`, token ? { token } : undefined);
}

// --- Orders (backend-django/orders) ------------------------------------------

export type RequirementStatus = "OPEN" | "MATCHED" | "FULFILLED" | "CANCELLED";

export interface Requirement {
  id: number;
  buyer: number;
  vertical: number;
  commodity: string;
  quantity: string;
  min_grade: string;
  max_price: string | null;
  budget: string | null;
  region: string;
  region_lat: number | null;
  region_lng: number | null;
  search_radius_km: number;
  status: RequirementStatus;
  created_at: string;
}

export interface CreateRequirementPayload {
  vertical: number;
  commodity: string;
  quantity: number;
  min_grade?: string;
  max_price?: number;
  region?: string;
}

/** GET /api/orders/requirements/ — scoped to the current user's role. */
export function listRequirements(token: string) {
  return djangoApi.get<Paginated<Requirement>>("/orders/requirements/", { token });
}

/** POST /api/orders/requirements/ — buyer is set server-side from the token. */
export function createRequirement(payload: CreateRequirementPayload, token: string) {
  return djangoApi.post<Requirement>("/orders/requirements/", payload, { token });
}

export interface MatchAttempt {
  matched: boolean;
  detail?: string;
  order_id?: number;
  requirement_status?: RequirementStatus;
  fully_fulfilled?: boolean;
  shortfall?: number;
}

/** POST /api/orders/requirements/{id}/match/ — proxies to FastAPI's matching
 * engine. Always resolves (200) with `matched: false` rather than throwing
 * when nothing matches yet — that's a normal outcome, not an error. */
export function triggerRequirementMatch(id: number, token: string) {
  return djangoApi.post<MatchAttempt>(`/orders/requirements/${id}/match/`, undefined, { token });
}

export type OrderStatus = "PENDING" | "CONFIRMED" | "FULFILLED" | "DISPUTED" | "CANCELLED";

export interface OrderAllocation {
  id: number;
  order: number;
  listing: number;
  commodity_name: string;
  unit: string;
  seller_name: string;
  allocated_quantity: string;
  unit_price: string;
  status: string;
}

export interface Order {
  id: number;
  requirement: number | null;
  buyer: number;
  status: OrderStatus;
  total_price: string | null;
  created_at: string;
  allocations: OrderAllocation[];
}

/** GET /api/orders/orders/ — scoped to the current user's role (read-only). */
export function listOrders(token: string) {
  return djangoApi.get<Paginated<Order>>("/orders/orders/", { token });
}

export type BidStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "COUNTERED" | "EXPIRED";

export interface Bid {
  id: number;
  listing: number;
  buyer: number;
  offered_price: string;
  offered_quantity: string;
  status: BidStatus;
  parent_bid: number | null;
  message: string;
  created_at: string;
}

export interface CreateBidPayload {
  listing: number;
  offered_price: number;
  offered_quantity: number;
  message?: string;
}

/** POST /api/orders/bids/ — buyer is set server-side from the token. Used
 * for both "Buy Now" (offered_price = the listing's asking price) and
 * "Place a bid" (a custom offer) — the backend doesn't distinguish them,
 * a bid is a bid either way, with `offered_price` deciding the difference. */
export function createBid(payload: CreateBidPayload, token: string) {
  return djangoApi.post<Bid>("/orders/bids/", payload, { token });
}

// --- Notifications (backend-django/notifications) ----------------------------

export type NotificationType =
  | "GRADING_COMPLETE"
  | "ORDER_MATCHED"
  | "BID_RECEIVED"
  | "DISPUTE_UPDATE"
  | "SYSTEM";

export interface Notification {
  id: number;
  user: number;
  type: NotificationType;
  title: string;
  message: string;
  related_object_type: string;
  related_object_id: number | null;
  is_read: boolean;
  fcm_sent: boolean;
  created_at: string;
}

/** GET /api/notifications/ — the current user's notifications. */
export function listNotifications(token: string) {
  return djangoApi.get<Paginated<Notification>>("/notifications/", { token });
}

/** POST /api/notifications/{id}/read/ */
export function markNotificationRead(id: number, token: string) {
  return djangoApi.post<Notification>(`/notifications/${id}/read/`, undefined, { token });
}

/** POST /api/notifications/read-all/ */
export function markAllNotificationsRead(token: string) {
  return djangoApi.post<{ marked_read: number }>("/notifications/read-all/", undefined, { token });
}

// --- Disputes (backend-django/disputes) --------------------------------------

export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "ESCALATED";
export type DisputeType = "GRADE_MISMATCH" | "QUANTITY_SHORTAGE" | "QUALITY_DEFECT" | "OTHER";

export interface Dispute {
  id: number;
  order: number;
  raised_by: number;
  raised_by_name: string;
  against: number;
  against_name: string;
  type: DisputeType;
  status: DisputeStatus;
  description: string;
  evidence_refs: unknown[];
  resolution_notes: string;
  created_at: string;
  resolved_at: string | null;
}

/** GET /api/disputes/ — scoped to the current user (party) or all (admin). */
export function listDisputes(token: string) {
  return djangoApi.get<Paginated<Dispute>>("/disputes/", { token });
}

/** PATCH /api/disputes/{id}/ */
export function updateDispute(
  id: number,
  payload: Partial<Pick<Dispute, "status" | "resolution_notes">>,
  token: string
) {
  return djangoApi.patch<Dispute>(`/disputes/${id}/`, payload, { token });
}

// --- Admin platform stats (backend-django/accounts) ---------------------------

export interface PlatformStats {
  total_listings: number;
  total_orders: number;
  total_users: number;
  revenue: number;
  revenue_delta_pct: number | null;
}

/** GET /api/auth/admin/stats/ — admin only. */
export function getPlatformStats(token: string) {
  return djangoApi.get<PlatformStats>("/auth/admin/stats/", { token });
}

// --- Pricing compute (backend-fastapi/pricing) --------------------------------
// No auth required — these are public compute endpoints, not tied to a user.

export interface BasePriceResponse {
  vertical: string;
  commodity: string;
  region: string | null;
  base_price: number;
  source: string;
  as_of: string;
}

/** GET /compute/pricing/base */
export function getBasePrice(vertical: string, commodity: string) {
  const params = new URLSearchParams({ vertical, commodity });
  return fastApi.get<BasePriceResponse>(`/pricing/base?${params}`);
}

export interface PriceEstimateResponse {
  vertical: string;
  commodity: string;
  quantity: number;
  min_grade: string | null;
  unit_price: number;
  estimated_total: number;
}

/** GET /compute/pricing/estimate — `min_grade` is a quantity-tier/grade
 * multiplier lookup, not a hard filter (see backend-fastapi/pricing/service.py). */
export function getPriceEstimate(params: {
  vertical: string;
  commodity: string;
  quantity: number;
  min_grade?: string;
}) {
  const qs = new URLSearchParams({
    vertical: params.vertical,
    commodity: params.commodity,
    quantity: String(params.quantity),
    ...(params.min_grade ? { min_grade: params.min_grade } : {}),
  });
  return fastApi.get<PriceEstimateResponse>(`/pricing/estimate?${qs}`);
}

export interface PriceTrendPoint {
  timestamp: string;
  price: number;
  source: string;
}

export interface PriceTrendsResponse {
  vertical: string;
  commodity: string;
  region: string | null;
  days: number;
  points: PriceTrendPoint[];
}

/** GET /compute/pricing/trends */
export function getPriceTrends(vertical: string, commodity: string, days = 30) {
  const params = new URLSearchParams({ vertical, commodity, days: String(days) });
  return fastApi.get<PriceTrendsResponse>(`/pricing/trends?${params}`);
}
