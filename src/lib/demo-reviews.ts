/**
 * Stable demo reviews for a Repair Pro (until live reviews API is wired).
 * Same tech always gets the same comments.
 */

export type ProReview = {
  id: string;
  author: string;
  rating: number;
  comment: string;
  ago: string;
};

const POOL: Omit<ProReview, "id">[] = [
  {
    author: "Chidi O.",
    rating: 5,
    comment: "Fast response and fixed my issue on the spot. Highly recommend.",
    ago: "2 days ago",
  },
  {
    author: "Amina B.",
    rating: 5,
    comment: "Professional and clear on pricing. Car sorted the same day.",
    ago: "1 week ago",
  },
  {
    author: "Tunde K.",
    rating: 4,
    comment: "Good work. Arrived a bit later than ETA but quality was solid.",
    ago: "2 weeks ago",
  },
  {
    author: "Ngozi E.",
    rating: 5,
    comment: "Polite, skilled, and explained everything. Will call again.",
    ago: "3 weeks ago",
  },
  {
    author: "Ibrahim S.",
    rating: 4,
    comment: "Helped with a roadside breakdown. Fair rate and clean job.",
    ago: "1 month ago",
  },
  {
    author: "Funke A.",
    rating: 5,
    comment: "Very reliable. Showed up Live when others were offline.",
    ago: "1 month ago",
  },
  {
    author: "Emeka N.",
    rating: 5,
    comment: "Knew the trade well. Problem diagnosed quickly.",
    ago: "6 weeks ago",
  },
  {
    author: "Blessing O.",
    rating: 4,
    comment: "Good communication in chat and careful with the vehicle.",
    ago: "2 months ago",
  },
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function reviewsForPro(techId: string, limit = 12): ProReview[] {
  const start = hashId(techId) % POOL.length;
  const out: ProReview[] = [];
  for (let i = 0; i < limit; i++) {
    const base = POOL[(start + i) % POOL.length];
    out.push({ ...base, id: `${techId}-rev-${i}` });
  }
  return out;
}
