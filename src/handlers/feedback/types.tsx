// Concrete request/result data shapes for the feedback command. These are data,
// not behavioral contracts, so they are type aliases (interfaces are reserved for
// the Core*Client contracts elsewhere in handlers/).

export type ScreenshotInput = { path: string };

export type SubmitFeedbackInput = {
  message: string;
  screenshot?: ScreenshotInput;
};

export type FeedbackSubmissionResult = {
  id: string;
  timestamp: string;
  reference: string;
};
