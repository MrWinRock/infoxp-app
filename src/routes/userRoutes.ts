import express from "express";
import {
    getUsers,
    createUser,
    loginUser,
    getUserById,
    getProfile,
    updatePassword,
    promoteUserToAdmin,
    deleteUser
} from "../controllers/userController";
import { authenticateToken, isAdmin } from "../middlewares/authMiddleware";

const router = express.Router();

// auth routes
router.post("/register", createUser);
router.post("/login", loginUser);

// profile routes
router.get("/profile/me", authenticateToken, getProfile);
router.put("/:id/password", authenticateToken, updatePassword);

// admin routes
router.get("/", authenticateToken, isAdmin, getUsers);
router.get("/:id", authenticateToken, isAdmin, getUserById);
router.delete("/:id", authenticateToken, isAdmin, deleteUser);
router.put("/:id/promote", authenticateToken, isAdmin, promoteUserToAdmin);

export default router;