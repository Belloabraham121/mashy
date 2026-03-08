/**
 * Auth: Privy access token → JWT, link wallet. Same pattern as zkperps.
 */
import { Router, Response } from "express";
import { verifyAccessToken, linkWallet, getSignerIdForFrontend } from "../lib/privy.js";
import { createToken, authenticate, type AuthRequest } from "../middleware/auth.js";

export const authController = Router();

async function handleVerifyToken(accessToken: string, res: Response): Promise<void> {
  const info = await verifyAccessToken(accessToken);
  const signerId = getSignerIdForFrontend();
  if (info.walletAddress) {
    const token = createToken({
      sub: info.userId,
      email: info.email,
      walletAddress: info.walletAddress,
    });
    res.json({
      token,
      walletAddress: info.walletAddress,
      ...(signerId && { signerId }),
      email: info.email,
    });
    return;
  }
  res.json({
    token: null,
    walletAddress: null,
    ...(signerId && { signerId }),
    email: info.email,
    message: "Call POST /api/auth/link with walletAddress and walletId (and same accessToken) after frontend has embedded wallet",
  });
}

authController.post("/signup", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accessToken } = req.body as { accessToken?: string };
    if (!accessToken || typeof accessToken !== "string") {
      res.status(400).json({ error: "accessToken required" });
      return;
    }
    await handleVerifyToken(accessToken, res);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Signup failed";
    res.status(401).json({ error: message });
  }
});

authController.post("/login", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accessToken } = req.body as { accessToken?: string };
    if (!accessToken || typeof accessToken !== "string") {
      res.status(400).json({ error: "accessToken required" });
      return;
    }
    await handleVerifyToken(accessToken, res);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Login failed";
    res.status(401).json({ error: message });
  }
});

authController.post("/verify-token", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accessToken } = req.body as { accessToken?: string };
    if (!accessToken || typeof accessToken !== "string") {
      res.status(400).json({ error: "accessToken required" });
      return;
    }
    await handleVerifyToken(accessToken, res);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Verify failed";
    res.status(401).json({ error: message });
  }
});

authController.post("/link", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accessToken, walletAddress, walletId } = req.body as {
      accessToken?: string;
      walletAddress?: string;
      walletId?: string;
    };
    if (!accessToken || !walletAddress) {
      res.status(400).json({ error: "accessToken and walletAddress required" });
      return;
    }
    const info = await verifyAccessToken(accessToken);
    await linkWallet(info.userId, walletAddress, walletId, info.email);
    const token = createToken({
      sub: info.userId,
      email: info.email,
      walletAddress,
    });
    const signerId = getSignerIdForFrontend();
    res.json({ token, walletAddress, ...(signerId && { signerId }), email: info.email });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Link failed";
    res.status(400).json({ error: message });
  }
});

authController.get("/me", authenticate, (req: AuthRequest, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({
    userId: req.user.sub,
    email: req.user.email,
    walletAddress: req.user.walletAddress,
  });
});
