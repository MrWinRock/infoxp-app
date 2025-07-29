import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/jwtService";

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email?: string;
        name?: string;
    };
}

export const authenticateToken = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Access token is required"
        });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(403).json({
            message: "Invalid or expired token"
        });
    }

    req.user = decoded;
    next();
};

export const optionalAuth = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
            req.user = decoded;
        }
    }

    next();
};