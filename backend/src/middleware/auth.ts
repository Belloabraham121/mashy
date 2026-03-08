import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { config } from "../config/index.js";

export interface JwtPayloadFields {
  sub: string;
  email?: string;
  walletAddress?: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JwtPayloadFields;
}

export function createToken(payload: Omit<JwtPayloadFields, "iat" | "exp">): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload & JwtPayloadFields;
    req.user = { sub: decoded.sub, email: decoded.email, walletAddress: decoded.walletAddress };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
