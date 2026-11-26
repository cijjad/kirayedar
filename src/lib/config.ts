// Single source of truth for product constants. The product name is a
// placeholder until branding is decided: set NEXT_PUBLIC_APP_NAME.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "IdeaBridge";

export const SECTORS = [
  "food_beverage",
  "fintech",
  "property",
  "tourism",
  "health",
  "education",
  "agri",
  "logistics",
  "retail_ecommerce",
  "professional_services",
  "other",
] as const;
export type Sector = (typeof SECTORS)[number];

export const KINDS = ["product", "service", "both"] as const;
export const STAGES = ["idea", "research", "prototype", "launched", "revenue"] as const;
export const REVENUE_MODELS = ["one_time", "subscription", "commission", "ads", "licensing", "other"] as const;

// PKR ranges expressed the way Pakistani founders talk: lakh / crore.
export const COST_RANGES = ["lt_5l", "5l_20l", "20l_1cr", "1cr_5cr", "gt_5cr"] as const;
export const FUNDING_RANGES = ["none", "lt_5l", "5l_20l", "20l_1cr", "1cr_5cr", "gt_5cr"] as const;
export const TIMELINES = ["lt_6m", "6_12m", "1_2y", "gt_2y"] as const;

export const CITIES = ["lahore", "rawalpindi", "islamabad", "other"] as const;

export const UPLOAD = {
  maxFiles: 5,
  maxBytes: 25 * 1024 * 1024,
  // MIME -> allowed extensions. Content is re-checked by magic bytes server-side.
  types: {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "application/pdf": ["pdf"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
    "video/mp4": ["mp4"],
  } as Record<string, string[]>,
  bucket: "idea-files",
};

export const LIMITS = {
  submitPerHourPerUser: 5,
  submitPerHourPerIp: 20,
  uploadSignPerHourPerUser: 30,
  analysisPerDayPerIdea: 5,
};
