/**
 * Vercel serverless entry: run Express app for all routes.
 * Build the backend first (npm run build) so dist/ exists.
 */
import { app } from "../dist/index.js";

export default app;
