export interface ProReview {
  id: string;
  jobId: string;
  motoristId: string;
  repairProId: string;
  rating: number;
  comment: string | null;
  photos: string[];
  motoristName?: string;
  createdAt: string;
}

export interface ProReviewStats {
  median: number | null;
  count: number;
  distribution: Record<number, number>;
  minReviews: number;
}

export const MIN_REVIEWS_FOR_RATING = 3;
