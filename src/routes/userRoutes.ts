import express from "express";
import {
    getUsers,
    createUser,
    loginUser,
    getUserById,
    getProfile,
    updatePassword
} from "../controllers/userController";
import { authenticateToken } from "../middlewares/authMiddleware";

const router = express.Router();

router.get("/", getUsers);
router.get("/:id", getUserById);
router.post("/register", createUser);
router.post("/login", loginUser);

router.get("/profile/me", authenticateToken, getProfile);
router.put("/:id/password", authenticateToken, updatePassword);

export default router;