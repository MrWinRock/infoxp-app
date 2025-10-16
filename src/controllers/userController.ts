import type { Request, Response } from "express";
import User from "../models/userModel";
import { generateToken } from "../services/jwtService";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { Types } from "mongoose";

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find({
      $or: [
        { email: { $exists: true, $nin: ["", null] } },
        { name: { $not: /^Guest$/i } }
      ]
    }).select("-password");
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users", error });
  }
};
export const createUser = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Name is required"
      });
    }

    if (email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json({
          message: "User with this email already exists"
        });
      }
    }

    if (password && password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long"
      });
    }

    const newUser = await new User(req.body).save() as typeof User.prototype;

    // Generate JWT token for the new user
    const token = generateToken({
      id: newUser._id.toString(),
      email: newUser.email,
      name: newUser.name,
      role: newUser.role
    });

    const userResponse = {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      date_of_birth: newUser.date_of_birth,
      role: newUser.role
    };

    res.status(201).json({
      message: "User created successfully",
      user: userResponse,
      token
    });
  } catch (error) {
    res.status(400).json({ message: "Failed to create user", error });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    const user = await User.findOne({ email }) as typeof User.prototype;
    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    // Generate JWT token
    const token = generateToken({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role
    });

    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      date_of_birth: user.date_of_birth,
      role: user.role
    };

    res.status(200).json({
      message: "Login successful",
      user: userResponse,
      token
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to login", error });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user", error });
  }
};

export const getProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      date_of_birth: user.date_of_birth,
      role: user.role
    };

    res.status(200).json({
      user: userResponse
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch profile", error });
  }
};

export const updatePassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters long"
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(401).json({
        message: "Current password is incorrect"
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update password", error });
  }
};

export const promoteUserToAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.role = "admin";
    await user.save();

    res.status(200).json({ message: `User ${user.name} has been promoted to admin.` });
  } catch (error: any) {
    console.error("promoteUserToAdmin error:", error);
    const status = error?.name === "ValidationError" ? 400 : 500;
    res.status(status).json({ message: "Failed to promote user", error: error?.message });
  }
};

export const demoteAdminToUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    } else if (user.role !== "admin") {
      return res.status(400).json({ message: "User is not an admin" });
    }

    user.role = "user";
    await user.save();

    res.status(200).json({ message: `Admin ${user.name} has been demoted to user.` });
  } catch (error: any) {
    console.error("demoteAdminToUser error:", error);
    const status = error?.name === "ValidationError" ? 400 : 500;
    res.status(status).json({ message: "Failed to demote admin", error: error?.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user", error });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const user = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    }).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      date_of_birth: user.date_of_birth,
      role: user.role
    };

    res.status(200).json({ message: "User updated successfully", user: userResponse });
  } catch (error) {
    res.status(500).json({ message: "Failed to update user", error });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ message: "Email and new password are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters long" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to reset password", error });
  }
};
