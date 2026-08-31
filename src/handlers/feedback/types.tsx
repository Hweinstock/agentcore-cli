import type { CoreOptions } from "../../core/types";

export interface ScreenshotInput {
  path: string;
}

export interface SubmitFeedbackInput {
  message: string;
  screenshot?: ScreenshotInput;
}

export interface FeedbackSubmissionResult {
  id: string;
  timestamp: string;
  reference: string;
}

// Consumer-defined interface (dependency inversion): the handler depends on this,
// src/core/feedback.tsx implements it. Message/screenshot validation happens inside
// submitFeedback so the one code path guards every caller.
export interface CoreFeedbackClient {
  submitFeedback(
    input: SubmitFeedbackInput,
    options: CoreOptions,
  ): Promise<FeedbackSubmissionResult>;
}
