export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: ApiError[];
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  field?: string;
  details?: unknown;
}
